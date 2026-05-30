"""
app/services/atractivo_service.py
──────────────────────────────────
Capa de lógica de negocio para AtractivoTuristico.
Los routers solo llaman a esta capa; nunca consultan la DB directamente.
"""

import logging
import re
import uuid

from geoalchemy2.shape import from_shape
from shapely.geometry import Point, mapping, shape
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.atractivo import AtractivoTuristico
from app.schemas.atractivo import AtractivoCreate, AtractivoUpdate

logger = logging.getLogger(__name__)


def _generar_slug(texto: str) -> str:
    """Genera un slug URL-friendly desde un texto en español."""
    traducciones = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
    slug = texto.lower().translate(traducciones)
    return re.sub(r"[^a-z0-9]+", "-", slug).strip("-")


def _geojson_a_wkb(geom_dict: dict) -> str:
    """Convierte un dict GeoJSON a formato WKT para GeoAlchemy2."""
    geom = shape(geom_dict)
    return f"SRID=4326;{geom.wkt}"


class AtractivoService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def listar(
        self,
        *,
        pagina: int = 1,
        por_pagina: int = 20,
        municipio: str | None = None,
        categoria_id: int | None = None,
        solo_activos: bool = True,
    ) -> tuple[list[AtractivoTuristico], int]:
        """Devuelve lista paginada y total de atractivos."""
        query = (
            select(AtractivoTuristico)
            .options(selectinload(AtractivoTuristico.categoria))
            .order_by(AtractivoTuristico.nombre)
        )

        if solo_activos:
            query = query.where(AtractivoTuristico.activo == True)  # noqa: E712
        if municipio:
            query = query.where(
                func.lower(AtractivoTuristico.municipio) == municipio.lower()
            )
        if categoria_id:
            query = query.where(AtractivoTuristico.categoria_id == categoria_id)

        # Total sin paginación
        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_query)).scalar_one()

        # Aplicar paginación
        query = query.offset((pagina - 1) * por_pagina).limit(por_pagina)
        result = await self.db.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def obtener_por_id(self, atractivo_id: uuid.UUID) -> AtractivoTuristico | None:
        """Obtiene un atractivo por UUID, cargando la categoría en la misma query."""
        result = await self.db.execute(
            select(AtractivoTuristico)
            .options(selectinload(AtractivoTuristico.categoria))
            .where(AtractivoTuristico.id == atractivo_id)
        )
        return result.scalar_one_or_none()

    async def crear(self, datos: AtractivoCreate) -> AtractivoTuristico:
        """Crea un nuevo atractivo turístico."""
        data_dict = datos.model_dump(exclude={"geom"})

        # Convertir geometría GeoJSON → WKB para PostGIS
        if datos.geom:
            data_dict["geom"] = _geojson_a_wkb(datos.geom.model_dump())

        # Generar slug único
        base_slug = _generar_slug(datos.nombre)
        data_dict["slug"] = f"{base_slug}-{uuid.uuid4().hex[:6]}"

        atractivo = AtractivoTuristico(**data_dict)
        self.db.add(atractivo)
        await self.db.flush()   # obtiene el id sin hacer commit
        
        logger.info("Atractivo creado: %s (%s)", atractivo.nombre, atractivo.id)
        
        # Consultamos el objeto completo usando nuestra propia función 
        # para que cargue la 'categoria' sin errores de MissingGreenlet
        atractivo_completo = await self.obtener_por_id(atractivo.id)
        return atractivo_completo

    async def actualizar(
        self, atractivo: AtractivoTuristico, datos: AtractivoUpdate
    ) -> AtractivoTuristico:
        """Actualiza campos de un atractivo existente (PATCH semántico)."""
        cambios = datos.model_dump(exclude_unset=True)
        for campo, valor in cambios.items():
            setattr(atractivo, campo, valor)

        await self.db.flush()
        await self.db.refresh(atractivo)
        return atractivo

    async def eliminar(self, atractivo: AtractivoTuristico) -> None:
        """Soft-delete: marca como inactivo en vez de borrar el registro."""
        atractivo.activo = False
        await self.db.flush()
        logger.info("Atractivo desactivado: %s", atractivo.id)

    async def buscar_cercanos(
        self,
        lon: float,
        lat: float,
        radio_m: int = 5000,
    ) -> list[tuple[AtractivoTuristico, float]]:
        """
        Devuelve atractivos dentro de `radio_m` metros del punto dado.
        Fuerza la geometría a 2D (ST_Force2D) para poder comparar el punto 
        del mapa (2D) con los registros de la base de datos (3D).
        """
        from sqlalchemy import cast
        from geoalchemy2.types import Geography

        punto_wkt = f"SRID=4326;POINT({lon} {lat})"
        
        # 1. Convertimos la columna a 2D y luego a geografía para medir en metros
        geom_2d_geog = cast(func.ST_Force2D(AtractivoTuristico.geom), Geography)
        
        # 2. El punto de búsqueda también a geografía
        punto_geog = cast(func.ST_GeomFromText(punto_wkt, 4326), Geography)

        result = await self.db.execute(
            select(
                AtractivoTuristico,
                func.ST_Distance(geom_2d_geog, punto_geog).label("distancia_m"),
            )
            .options(selectinload(AtractivoTuristico.categoria))
            .where(
                AtractivoTuristico.activo == True,
                func.ST_DWithin(geom_2d_geog, punto_geog, radio_m),
            )
            .order_by("distancia_m")
        )
        return [(row.AtractivoTuristico, row.distancia_m) for row in result]