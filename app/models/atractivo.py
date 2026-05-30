"""
app/models/atractivo.py
────────────────────────
Modelo ORM para la tabla turismo.atractivos_turisticos.
Demuestra el uso de GeoAlchemy2 para columnas espaciales de PostGIS.
"""

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CategoriaAtractivo(Base):
    __tablename__ = "categorias_atractivo"
    __table_args__ = {"schema": "turismo"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    icono: Mapped[str | None] = mapped_column(String(100))
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relación inversa
    atractivos: Mapped[list["AtractivoTuristico"]] = relationship(
        back_populates="categoria"
    )


class AtractivoTuristico(Base):
    __tablename__ = "atractivos_turisticos"
    __table_args__ = (
        CheckConstraint(
            "tipo_geom IN ('POINT', 'POLYGON', 'MULTIPOLYGON')",
            name="ck_atractivos_turisticos_tipo_geom",
        ),
        CheckConstraint(
            "calificacion BETWEEN 0 AND 5",
            name="ck_atractivos_turisticos_calificacion",
        ),
        {"schema": "turismo"},
    )

    # ── Identidad ──────────────────────────────────────────────────────────────
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str | None] = mapped_column(String(300), unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    descripcion_corta: Mapped[str | None] = mapped_column(String(500))

    # ── Geometría PostGIS ──────────────────────────────────────────────────────
    # geometry_type="GEOMETRYZ" acepta POINT, POLYGON y MULTIPOLYGON con altitud.
    # srid=4326 → WGS 84 (coordenadas GPS estándar).
    geom: Mapped[Geometry | None] = mapped_column(
        Geometry(geometry_type="GEOMETRYZ", srid=4326, spatial_index=True)
    )
    tipo_geom: Mapped[str] = mapped_column(String(20), nullable=False)

    # ── Clasificación ──────────────────────────────────────────────────────────
    categoria_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("turismo.categorias_atractivo.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    categoria: Mapped["CategoriaAtractivo"] = relationship(back_populates="atractivos")

    # ── Calidad ────────────────────────────────────────────────────────────────
    calificacion: Mapped[float | None] = mapped_column(Numeric(3, 2))
    num_resenas: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Información operativa ──────────────────────────────────────────────────
    horarios: Mapped[dict | None] = mapped_column(JSONB)
    precio_entrada: Mapped[float | None] = mapped_column(Numeric(12, 2))
    moneda: Mapped[str] = mapped_column(String(3), default="COP")
    acceso_libre: Mapped[bool] = mapped_column(Boolean, default=False)
    accesibilidad: Mapped[dict | None] = mapped_column(JSONB)

    # ── Ubicación administrativa ───────────────────────────────────────────────
    departamento: Mapped[str | None] = mapped_column(String(100))
    municipio: Mapped[str | None] = mapped_column(String(100), index=True)
    vereda: Mapped[str | None] = mapped_column(String(100))
    direccion: Mapped[str | None] = mapped_column(Text)

    # ── Multimedia ────────────────────────────────────────────────────────────
    # URL relativa servida por FastAPI StaticFiles.
    # Ej: "/static/uploads/550e8400-e29b-41d4-a716-446655440000.webp"
    # Procesada con Pillow: max 1080px de ancho, formato WebP, calidad 85.
    imagen_principal: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Control ───────────────────────────────────────────────────────────────
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verificado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<AtractivoTuristico id={self.id} nombre={self.nombre!r}>"