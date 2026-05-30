"""
app/api/v1/routers/atractivos.py
──────────────────────────────────
Router de Atractivos Turísticos.

Endpoints expuestos (prefijo base: /api/v1):
  GET    /atractivos                    → Listar con paginación y filtros
  POST   /atractivos                    → Crear nuevo atractivo
  GET    /atractivos/{id}               → Obtener por UUID
  PATCH  /atractivos/{id}               → Actualizar parcialmente
  DELETE /atractivos/{id}               → Soft-delete (desactivar)
  GET    /atractivos/cercanos           → Búsqueda geoespacial por radio

Separación de responsabilidades:
  - El router valida HTTP (status codes, serialización, parámetros de query).
  - AtractivoService contiene TODA la lógica de negocio y acceso a DB.
  - Los routers nunca importan modelos ORM directamente.
"""
import os
import aiofiles
from io import BytesIO
from PIL import Image
import logging
import uuid

from typing import Annotated
from fastapi import (
    APIRouter,
    HTTPException,
    status,
    Query,
    UploadFile,
    File,
)

from geoalchemy2.shape import to_shape

from app.db.session import DbSession
from app.schemas.atractivo import (
    AtractivoCreate,
    AtractivoListResponse,
    AtractivoResponse,
    AtractivoUpdate,
)

from app.services.atractivo_service import AtractivoService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/atractivos")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _orm_a_response(atractivo, distancia_m: float = None) -> AtractivoResponse:
    """
    Convierte un ORM AtractivoTuristico en el schema de respuesta.
    Serializa la geometría PostGIS a WKT para que sea JSON-serializable.
    Incluye la distancia calculada en metros si viene de una consulta espacial.
    """
    data = {
        col.name: getattr(atractivo, col.name)
        for col in atractivo.__table__.columns
        if col.name != "geom"
    }

    # Serializar geometría → WKT (ej: "POINT Z (-74.6193 4.3066 0)")
    geom_wkt = None
    if atractivo.geom is not None:
        try:
            # Aseguramos la importación local para evitar NameError ocultos por el except
            from geoalchemy2.shape import to_shape  
            geom_wkt = to_shape(atractivo.geom).wkt
        except Exception:
            pass   # geometría nula o corrupta → devolvemos None

    data["geom_wkt"] = geom_wkt

    # Añadir categoría embebida si está cargada
    data["categoria"] = atractivo.categoria if atractivo.categoria else None

    # Acoplamos la distancia calculada por la consulta de PostGIS
    data["distancia_m"] = distancia_m

    return AtractivoResponse(**data)


# ── GET /atractivos ────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=AtractivoListResponse,
    summary="Listar atractivos turísticos",
    status_code=status.HTTP_200_OK,
)
async def listar_atractivos(
    db: DbSession,
    pagina: Annotated[int, Query(ge=1, description="Número de página")] = 1,
    por_pagina: Annotated[int, Query(ge=1, le=100, description="Resultados por página")] = 20,
    municipio: Annotated[str | None, Query(description="Filtrar por municipio")] = None,
    categoria_id: Annotated[int | None, Query(description="Filtrar por categoría")] = None,
    solo_activos: Annotated[bool, Query(description="Solo mostrar atractivos activos")] = True,
) -> AtractivoListResponse:
    """
    Devuelve una lista paginada de atractivos turísticos.

    - Filtra opcionalmente por **municipio** y/o **categoría**.
    - El total de resultados se incluye en la respuesta para paginación en el cliente.
    """
    service = AtractivoService(db)
    items, total = await service.listar(
        pagina=pagina,
        por_pagina=por_pagina,
        municipio=municipio,
        categoria_id=categoria_id,
        solo_activos=solo_activos,
    )

    return AtractivoListResponse(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        items=[_orm_a_response(a) for a in items],
    )


# ── POST /atractivos ───────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=AtractivoResponse,
    summary="Crear atractivo turístico",
    status_code=status.HTTP_201_CREATED,
)
async def crear_atractivo(
    datos: AtractivoCreate,
    db: DbSession,
) -> AtractivoResponse:
    """
    Registra un nuevo atractivo turístico en la plataforma.

    - El campo `geom` acepta GeoJSON Point: `{"type": "Point", "coordinates": [lon, lat]}`.
    - El `slug` se genera automáticamente desde el nombre.
    - `tipo_geom` debe coincidir con el tipo real de geometría enviada.
    """
    service = AtractivoService(db)

    try:
        atractivo = await service.crear(datos)
    except Exception as exc:
        logger.error("Error creando atractivo: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No se pudo crear el atractivo: {exc}",
        ) from exc

    logger.info("POST /atractivos → creado %s", atractivo.id)
    return _orm_a_response(atractivo)


# ── GET /atractivos/cercanos ───────────────────────────────────────────────────
# IMPORTANTE: esta ruta debe ir ANTES de /{id} para que FastAPI no interprete
# "cercanos" como un UUID.

@router.get(
    "/cercanos",
    response_model=list[dict],
    summary="Buscar atractivos cercanos",
    status_code=status.HTTP_200_OK,
)
async def atractivos_cercanos(
    db: DbSession,
    lon: Annotated[float, Query(ge=-180, le=180, description="Longitud (WGS84)")],
    lat: Annotated[float, Query(ge=-90, le=90, description="Latitud (WGS84)")],
    radio_m: Annotated[int, Query(ge=100, le=50_000, description="Radio de búsqueda en metros")] = 5000,
) -> list[dict]:
    """
    Devuelve los atractivos dentro del **radio** (en metros) alrededor de un punto.

    Usa `ST_DWithin` sobre geografía para garantizar distancias métricas reales,
    sin distorsión de proyección cartesiana.

    **Ejemplo:** `GET /api/v1/atractivos/cercanos?lon=-74.0721&lat=4.7110&radio_m=3000`
    """
    # Importamos localmente la utilidad para traducir la geometría binaria de PostGIS a texto plano
    from geoalchemy2.shape import to_shape

    service = AtractivoService(db)
    resultados = await service.buscar_cercanos(lon=lon, lat=lat, radio_m=radio_m)

    return [
        {
            "id": str(atractivo.id),
            "nombre": atractivo.nombre,
            "municipio": atractivo.municipio,
            "categoria": atractivo.categoria.nombre if atractivo.categoria else None,
            "distancia_m": round(distancia, 1),
            "calificacion": float(atractivo.calificacion) if atractivo.calificacion else None,
            # 👉 ESTA ES LA LÍNEA MÁGICA: Le enviamos la geometría traducida a WKT al frontend
            "geom_wkt": to_shape(atractivo.geom).wkt if atractivo.geom is not None else None,
            "imagen_principal": atractivo.imagen_principal,
            "descripcion_corta": atractivo.descripcion_corta,
        }
        for atractivo, distancia in resultados
    ]

# ── GET /atractivos/{id} ───────────────────────────────────────────────────────

@router.get(
    "/{atractivo_id}",
    response_model=AtractivoResponse,
    summary="Obtener atractivo por ID",
    status_code=status.HTTP_200_OK,
)
async def obtener_atractivo(
    atractivo_id: uuid.UUID,
    db: DbSession,
) -> AtractivoResponse:
    """Obtiene el detalle completo de un atractivo turístico por su UUID."""
    service = AtractivoService(db)
    atractivo = await service.obtener_por_id(atractivo_id)

    if atractivo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Atractivo con id '{atractivo_id}' no encontrado.",
        )

    return _orm_a_response(atractivo)


# ── PATCH /atractivos/{id} ─────────────────────────────────────────────────────

@router.patch("/{atractivo_id}", response_model=AtractivoResponse)
async def actualizar_atractivo(
    atractivo_id: uuid.UUID,
    payload: AtractivoUpdate,
    db: DbSession # Asegúrate de usar tu inyector de sesión habitual
):
    """
    Actualiza parcialmente un atractivo turístico. 
    Soporta la reubicación geométrica geoespacial PostGIS.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.atractivo import AtractivoTuristico

    # 1. Buscar si el atractivo existe
    stmt = select(AtractivoTuristico) .options(selectinload(AtractivoTuristico.categoria)).where(AtractivoTuristico.id == atractivo_id)
    result = await db.execute(stmt)
    atractivo = result.scalars().first()

    if not atractivo:
        raise HTTPException(status_code=404, detail="Atractivo no encontrado.")

    # 2. Convertir el payload a diccionario excluyendo lo que no se envió
    update_data = payload.model_dump(exclude_unset=True)

    # 3. 👉 TRATAMIENTO ESPACIAL CRÍTICO: Si se reubicó el pin en el mapa
    if "geom" in update_data and update_data["geom"] is not None:
        from geoalchemy2.shape import from_shape
        from shapely.geometry import Point
        
        geojson_geom = update_data.pop("geom")
        coords = geojson_geom["coordinates"]
        
        # Extraer longitud, latitud y altitud opcional para PostGIS 3D
        lon, lat = coords[0], coords[1]
        alt = coords[2] if len(coords) > 2 else 0
        
        # Reemplazar la geometría vieja con el nuevo punto calibrado
        atractivo.geom = from_shape(Point(lon, lat, alt), srid=4326)

    # 4. Actualizar el resto de campos planos convencionales
    for key, value in update_data.items():
        setattr(atractivo, key, value)

    # 5. Confirmar persistencia en PostgreSQL
    await db.commit()
    await db.refresh(atractivo)

    # Retornar usando tu serializador corregido
    return _orm_a_response(atractivo)

# ── DELETE /atractivos/{id} ────────────────────────────────────────────────────

@router.delete(
    "/{atractivo_id}",
    summary="Desactivar atractivo (soft-delete)",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def eliminar_atractivo(
    atractivo_id: uuid.UUID,
    db: DbSession,
) -> None:
    """
    Realiza un **soft-delete**: marca el atractivo como `activo = false`.
    El registro permanece en la base de datos para auditoría y puede reactivarse.
    """
    service = AtractivoService(db)
    atractivo = await service.obtener_por_id(atractivo_id)

    if atractivo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Atractivo con id '{atractivo_id}' no encontrado.",
        )

    await service.eliminar(atractivo)
    logger.info("DELETE /atractivos/%s → desactivado", atractivo_id)
    # 204 No Content → sin body de respuesta
    
@router.post("/{id}/imagen", summary="Subir y optimizar imagen principal")
async def subir_imagen_atractivo(
    id: uuid.UUID,
    db: DbSession,
    file: UploadFile = File(...)
):
    """
    Recibe una imagen, la redimensiona a un máximo de 1080px de ancho,
    la convierte a formato WebP altamente optimizado y actualiza la BD.
    """
    # 1. Validar que sí sea una imagen
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen válida.")

    # 2. Buscar el atractivo en la base de datos
    from sqlalchemy import select
    from app.models.atractivo import AtractivoTuristico
    
    stmt = select(AtractivoTuristico).where(AtractivoTuristico.id == id)
    result = await db.execute(stmt)
    atractivo = result.scalars().first()

    if not atractivo:
        raise HTTPException(status_code=404, detail="Atractivo no encontrado.")

    # 3. Leer el archivo en memoria
    content = await file.read()

    try:
        # 4. Magia de Pillow: Abrir y procesar
        img = Image.open(BytesIO(content))

        # Convertir a RGB (necesario si la foto original es PNG con transparencia)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        # Redimensionar proporcionalmente si es gigante (>1080px)
        MAX_WIDTH = 1080
        if img.width > MAX_WIDTH:
            ratio = MAX_WIDTH / img.width
            new_height = int(img.height * ratio)
            img = img.resize((MAX_WIDTH, new_height), Image.Resampling.LANCZOS)

        # 5. Generar un nombre único para no sobrescribir fotos
        filename = f"{uuid.uuid4()}.webp"
        file_path = os.path.join("static", "uploads", filename)
        relative_url = f"/static/uploads/{filename}"

        # 6. Guardar físicamente en el disco (optimizado al 85%)
        buffer = BytesIO()
        img.save(buffer, format="WEBP", quality=85)
        
        async with aiofiles.open(file_path, "wb") as out_file:
            await out_file.write(buffer.getvalue())

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar la foto: {str(e)}")

    # 7. Actualizar la base de datos con la nueva ruta
    atractivo.imagen_principal = relative_url
    await db.commit()

    return {
        "mensaje": "Imagen subida y optimizada exitosamente.",
        "imagen_principal": relative_url
    }
    