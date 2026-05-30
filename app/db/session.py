"""
app/db/session.py
──────────────────
Motor async de SQLAlchemy y fábrica de sesiones.

Decisiones de diseño:
- asyncpg como driver (mejor rendimiento que aiopg).
- NullPool en tests para evitar interferencia entre sesiones.
- get_db() como dependency FastAPI: abre/cierra sesión por request.
"""

import logging
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Motor principal ────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,           # imprime SQL en modo debug
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout,
    pool_pre_ping=True,            # verifica conexiones "muertas" antes de usarlas
    pool_recycle=3600,             # recicla conexiones cada hora
)

# ── Fábrica de sesiones ────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,        # evita lazy-load sorpresas tras commit
    autoflush=False,
    autocommit=False,
)


# ── Dependency de FastAPI ──────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency que provee una sesión de base de datos por request.
    Hace rollback automático si ocurre cualquier excepción.

    Uso en un router:
        @router.get("/items")
        async def list_items(db: DbSession):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Alias de tipo para inyección limpia en routers
DbSession = Annotated[AsyncSession, Depends(get_db)]