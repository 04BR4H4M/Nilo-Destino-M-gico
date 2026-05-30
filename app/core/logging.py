"""
app/core/logging.py
────────────────────
Configuración de logging estructurado.
En producción emite JSON; en desarrollo, texto legible con colores.
"""

import logging
import sys

from app.core.config import settings


def setup_logging() -> None:
    """Configura el logger raíz de la aplicación."""
    log_level = logging.DEBUG if settings.debug else logging.INFO

    fmt = (
        "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
        if not settings.is_production
        else '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}'
    )

    logging.basicConfig(
        level=log_level,
        format=fmt,
        datefmt="%Y-%m-%dT%H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # Silenciar loggers muy verbosos de librerías externas
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.debug else logging.WARNING
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


logger = logging.getLogger("turismo_api")