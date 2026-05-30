"""
app/db/base.py
───────────────
Base declarativa compartida por todos los modelos ORM.
Importar aquí los modelos asegura que Alembic los detecte en autogenerate.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Convención de nombres para constraints — esencial para migraciones Alembic
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """
    Base declarativa común. Todos los modelos heredan de esta clase.
    MetaData con convenciones de nombres para constraints.
    """
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# ── Importar modelos aquí para que Alembic los descubra ───────────────────────
# (descomentar a medida que se crean los modelos)
# from app.models.atractivo import AtractivoTuristico      # noqa: F401
# from app.models.prestador import PrestadorServicio       # noqa: F401
# from app.models.ruta import RutaHistorica                # noqa: F401