"""
app/schemas/atractivo.py
─────────────────────────
Schemas Pydantic v2 para validación de entrada/salida de AtractivoTuristico.

Separamos en tres capas:
  Base    → campos compartidos entre Create, Update y Response.
  Create  → campos requeridos al crear.
  Update  → todos opcionales (PATCH semántico).
  Response → lo que devuelve la API (incluye campos calculados).
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── Geometría ─────────────────────────────────────────────────────────────────

class PuntoGeoJSON(BaseModel):
    """GeoJSON Point para entrada/salida de coordenadas."""
    type: str = Field("Point", pattern="^Point$")
    coordinates: list[float] = Field(
        ...,
        min_length=2,
        max_length=3,
        description="[longitud, latitud] o [longitud, latitud, altitud]",
    )

    @field_validator("coordinates")
    @classmethod
    def validar_coordenadas(cls, v: list[float]) -> list[float]:
        lon, lat = v[0], v[1]
        if not (-180 <= lon <= 180):
            raise ValueError(f"Longitud fuera de rango: {lon}")
        if not (-90 <= lat <= 90):
            raise ValueError(f"Latitud fuera de rango: {lat}")
        return v


# ── Categoría (embebida en respuestas) ────────────────────────────────────────

class CategoriaResumen(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    icono: str | None = None


# ── Atractivo ─────────────────────────────────────────────────────────────────

class AtractivoBase(BaseModel):
    nombre: str = Field(..., min_length=3, max_length=255)
    descripcion: str | None = None
    descripcion_corta: str | None = Field(None, max_length=500)
    tipo_geom: str = Field(..., pattern="^(POINT|POLYGON|MULTIPOLYGON)$")
    categoria_id: int
    calificacion: float | None = Field(None, ge=0, le=5)
    precio_entrada: float | None = Field(None, ge=0)
    moneda: str = Field("COP", min_length=3, max_length=3)
    acceso_libre: bool = False
    horarios: dict[str, Any] | None = None
    accesibilidad: dict[str, Any] | None = None
    departamento: str | None = None
    municipio: str | None = None
    vereda: str | None = None
    direccion: str | None = None


class AtractivoCreate(AtractivoBase):
    """Schema para POST /atractivos"""
    geom: PuntoGeoJSON | None = Field(
        None,
        description="Geometría GeoJSON. Requerida para tipo_geom=POINT.",
    )


class AtractivoUpdate(BaseModel):
    """Schema para PATCH /atractivos/{id} — todos los campos son opcionales."""
    nombre: str | None = Field(None, min_length=3, max_length=255)
    descripcion: str | None = None
    descripcion_corta: str | None = None
    calificacion: float | None = Field(None, ge=0, le=5)
    precio_entrada: float | None = None
    acceso_libre: bool | None = None
    horarios: dict[str, Any] | None = None
    activo: bool | None = None

    # 👉 AÑADE ESTOS DOS CAMPOS MULTIMEDIA Y ESPACIALES:
    tipo_geom: str | None = Field(None, pattern="^(POINT|POLYGON|MULTIPOLYGON)$")
    geom: PuntoGeoJSON | None = Field(None, description="Nueva geometría GeoJSON si se reubica el pin")



class AtractivoResponse(AtractivoBase):
    """Schema para respuestas de la API."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str | None = None
    num_resenas: int
    activo: bool
    verificado: bool
    creado_en: datetime
    actualizado_en: datetime
    categoria: CategoriaResumen | None = None
    imagen_principal: str | None = Field(None, description="URL relativa de la imagen WebP optimizada")

    # La geometría se serializa como WKT o GeoJSON en el servicio
    geom_wkt: str | None = Field(None, description="Geometría en formato WKT")


class AtractivoListResponse(BaseModel):
    """Respuesta paginada para listados."""
    total: int
    pagina: int
    por_pagina: int
    items: list[AtractivoResponse]