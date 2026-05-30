"""
app/schemas/health.py
──────────────────────
Schemas para el endpoint de health check.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class ServiceStatus(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"
    DOWN = "down"


class DatabaseInfo(BaseModel):
    status: ServiceStatus
    latency_ms: float | None = None
    version: str | None = None
    postgis_version: str | None = None
    message: str | None = None


class HealthResponse(BaseModel):
    status: ServiceStatus
    timestamp: datetime
    version: str
    environment: str
    database: DatabaseInfo