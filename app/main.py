"""
app/main.py
────────────
Punto de entrada de la aplicación FastAPI.

Responsabilidades:
  - Inicializar la app con metadata OpenAPI.
  - Lifespan: verificar DB/PostGIS al arrancar, cerrar pool al apagar.
  - CORSMiddleware con orígenes desde config.py (lista validada por Pydantic).
  - Middlewares globales y manejadores de errores.
  - Registro de routers versionados.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.v1.routers import atractivos, health
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import engine

setup_logging()
logger = logging.getLogger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: verifica PostgreSQL y PostGIS.
    Shutdown: cierra el pool de conexiones limpiamente.
    """
    logger.info(
        "⚡ Iniciando %s v%s [entorno: %s]",
        settings.project_name,
        settings.project_version,
        settings.app_env,
    )

    # Log de diagnóstico CORS — visible en arranque para depuración rápida
    logger.info("🌐 CORS habilitado para: %s", settings.cors_origins_as_str)

    try:
        async with engine.connect() as conn:
            pg_ver = (await conn.execute(text("SELECT version()"))).scalar()
            logger.info("✅ PostgreSQL: %s", pg_ver.split(",")[0])

            postgis_ver = (await conn.execute(text("SELECT PostGIS_Lib_Version()"))).scalar()
            logger.info("✅ PostGIS: v%s", postgis_ver)

    except Exception as exc:
        # No detener el arranque — permite modo degradado en CI/CD
        logger.error("❌ Base de datos inaccesible al arrancar: %s", exc)

    logger.info("🚀 API lista para recibir peticiones.")
    yield

    logger.info("🛑 Apagando — cerrando pool de conexiones...")
    await engine.dispose()
    logger.info("🔌 Pool cerrado correctamente.")


# ── Instancia FastAPI ──────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.project_name,
    version=settings.project_version,
    description="""
## API RESTful — Plataforma Turística

Gestión de **Atractivos Turísticos**, **Prestadores de Servicios** (RNT)
y **Rutas Históricas** con soporte espacial PostGIS.

### Stack técnico
- 🌍 Geometrías espaciales vía **PostGIS + GeoAlchemy2**
- ⚡ I/O completamente **asíncrono** (asyncpg + SQLAlchemy 2)
- ✅ Validación estricta con **Pydantic V2**
- 📄 Paginación, filtros y búsqueda por proximidad geográfica
""",
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
    docs_url=f"{settings.api_v1_prefix}/docs",
    redoc_url=f"{settings.api_v1_prefix}/redoc",
    # Ocultar docs en producción para reducir superficie de ataque
    # docs_url=None if settings.is_production else f"{settings.api_v1_prefix}/docs",
    lifespan=lifespan,
)

# 👇 INYECTA ESTO EXACTAMENTE AQUÍ 👇
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Abre la puerta para que el celular pase
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Middlewares ────────────────────────────────────────────────────────────────
#
# ORDEN IMPORTA: Starlette aplica los middlewares de abajo hacia arriba
# en el request, y de arriba hacia abajo en el response.
# CORSMiddleware debe ir PRIMERO (último en agregarse = primero en ejecutarse)
# para que el preflight OPTIONS sea respondido antes de cualquier otro proceso.

app.add_middleware(
    CORSMiddleware,
    # ── PUNTO CRÍTICO ──────────────────────────────────────────────────────
    # Se usa `cors_origins_as_str` (list[str]) en lugar de `cors_origins`
    # (list[AnyHttpUrl]) porque CORSMiddleware de Starlette hace comparación
    # de strings exacta: "http://localhost:5173" == "http://localhost:5173".
    # AnyHttpUrl serializa con slash final: "http://localhost:5173/" ≠ sin slash.
    # La propiedad cors_origins_as_str hace el .rstrip("/") necesario.
    allow_origins=settings.cors_origins_as_str,
    # ────────────────────────────────────────────────────────────────────────
    allow_credentials=True,          # permite enviar cookies y headers de auth
    allow_methods=["*"],             # GET, POST, PUT, PATCH, DELETE, OPTIONS
    allow_headers=["*"],             # Content-Type, Authorization, etc.
    expose_headers=["X-Total-Count"],# el frontend puede leer este header de paginación
)

app.add_middleware(GZipMiddleware, minimum_size=1_024)


# ── Archivos estáticos ─────────────────────────────────────────────────────────
# Sirve imágenes subidas (WebP optimizadas por Pillow) en /static/uploads/.
# La carpeta debe existir antes de arrancar el servidor.
# En producción, considerar mover esto a un CDN (Cloudflare R2, S3, etc.).
app.mount(
    "/static",
    StaticFiles(directory=settings.static_dir, html=False),
    name="static",
)


# ── Manejadores de error globales ──────────────────────────────────────────────

@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={
            "error": "recurso_no_encontrado",
            "mensaje": "El recurso solicitado no existe.",
            "path": str(request.url.path),
        },
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error interno no controlado en %s", request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "error_interno",
            "mensaje": "Ocurrió un error inesperado. Por favor, intenta de nuevo.",
        },
    )


# ── Routers ────────────────────────────────────────────────────────────────────

app.include_router(
    health.router,
    prefix="/api",            # GET /api/health — sin versión, siempre estable
    tags=["Infraestructura"],
)

app.include_router(
    atractivos.router,
    prefix=settings.api_v1_prefix,
    tags=["Atractivos Turísticos"],
)

# Futuros routers:
# app.include_router(prestadores.router, prefix=settings.api_v1_prefix, tags=["Prestadores"])
# app.include_router(rutas.router,       prefix=settings.api_v1_prefix, tags=["Rutas Históricas"])
# app.include_router(auth.router,        prefix=settings.api_v1_prefix, tags=["Autenticación"])