"""
app/api/v1/routers/health.py
─────────────────────────────
Endpoint de salud del sistema.

GET /api/health
  → Verifica que la API responde, que PostgreSQL acepta conexiones
    y que la extensión PostGIS está disponible.
  → Devuelve latencia de la DB para monitoreo de rendimiento.
  → No requiere autenticación (debe ser accesible por balanceadores y probes de k8s).
"""

import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.schemas.health import DatabaseInfo, HealthResponse, ServiceStatus

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description=(
        "Verifica el estado del servidor y la conectividad con PostgreSQL/PostGIS. "
        "Devuelve `status: ok` solo si **todos** los servicios están operativos."
    ),
    responses={
        200: {"description": "Servicio operativo (puede ser `ok` o `degraded`)"},
        503: {"description": "Servicio caído — base de datos inaccesible"},
    },
)
async def health_check() -> HealthResponse:
    """
    Sondea la base de datos con una query mínima y devuelve:
    - Estado global (`ok` | `degraded` | `down`).
    - Latencia de la DB en milisegundos.
    - Versión de PostgreSQL y PostGIS.
    """
    db_info = await _check_database()

    # Estado global: solo "ok" si la DB también lo está
    global_status = (
        ServiceStatus.OK if db_info.status == ServiceStatus.OK else ServiceStatus.DEGRADED
    )

    return HealthResponse(
        status=global_status,
        timestamp=datetime.now(timezone.utc),
        version=settings.project_version,
        environment=settings.app_env,
        database=db_info,
    )


async def _check_database() -> DatabaseInfo:
    """
    Abre una sesión corta, ejecuta dos queries baratas y mide la latencia.
    Captura cualquier error para retornar estado `down` sin explotar la API.
    """
    start = time.perf_counter()

    try:
        async with AsyncSessionLocal() as session:
            # Query 1: versión de PostgreSQL
            pg_row = await session.execute(text("SELECT version()"))
            pg_version: str = pg_row.scalar_one()

            # Query 2: versión de PostGIS (falla si la extensión no está instalada)
            postgis_row = await session.execute(text("SELECT PostGIS_Lib_Version()"))
            postgis_version: str = postgis_row.scalar_one()

        latency_ms = round((time.perf_counter() - start) * 1000, 2)

        return DatabaseInfo(
            status=ServiceStatus.OK,
            latency_ms=latency_ms,
            # Extraer solo "PostgreSQL X.Y.Z" de la cadena larga
            version=pg_version.split(",")[0].strip(),
            postgis_version=postgis_version,
        )

    except SQLAlchemyError as exc:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.error("Health check — error de base de datos: %s", exc)
        return DatabaseInfo(
            status=ServiceStatus.DOWN,
            latency_ms=latency_ms,
            message=f"Error de conexión: {type(exc).__name__}",
        )

    except Exception as exc:
        logger.error("Health check — error inesperado: %s", exc)
        return DatabaseInfo(
            status=ServiceStatus.DOWN,
            message=f"Error inesperado: {type(exc).__name__}",
        )