"""
app/core/config.py
──────────────────
Configuración centralizada con pydantic-settings 2.x (Pydantic V2).

═══════════════════════════════════════════════════════════════════════
  POR QUÉ ESTA CONFIGURACIÓN RESUELVE EL BUG DE CORS
═══════════════════════════════════════════════════════════════════════

El error clásico ocurre cuando cors_origins se declara como list[str]
y en el .env se escribe:

    CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

Pydantic V2 lee eso como una sola cadena de texto:
    '["http://localhost:5173","http://localhost:3000"]'

FastAPI se lo pasa a CORSMiddleware como:
    allow_origins=['["http://localhost:5173","http://localhost:3000"]']

El middleware compara el header Origin: http://localhost:5173
contra la cadena literal '["http://localhost:5173",...]' → no coincide → BLOQUEA.

LA SOLUCIÓN NATIVA DE PYDANTIC V2:
Declarar el campo con el tipo `list[AnyHttpUrl]` (o `list[str]`) y
escribir en el .env con sintaxis de valores separados por comas
(SIN corchetes ni comillas JSON):

    CORS_ORIGINS=http://localhost:5173,http://localhost:3000

pydantic-settings 2.x tiene un parser nativo para este formato llamado
"comma-separated list" que convierte automáticamente la cadena en una
lista de Python. No se necesita json.loads(), no se necesita validator.

ALTERNATIVA con JSON (si prefieres el formato con corchetes):
Cambiar el tipo del campo a:
    cors_origins: Json[list[str]] = ...

y en el .env escribir:
    CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

Ambas son nativas de Pydantic V2. Este archivo usa la sintaxis de comas
por ser más legible y menos propensa a errores de escape en el .env.
═══════════════════════════════════════════════════════════════════════
"""

from functools import lru_cache

from pydantic import AnyHttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Fuente única de verdad para toda la configuración de la aplicación.

    Prioridad de resolución (mayor a menor):
      1. Variables de entorno del sistema operativo
      2. Archivo .env en la raíz del proyecto
      3. Valores por defecto definidos en la clase

    Esto garantiza que en producción (Railway, Render, Docker) las
    variables de entorno del sistema sobreescriben siempre el .env,
    sin necesidad de modificar el código.
    """

    model_config = SettingsConfigDict(
        # Ruta al .env relativa al directorio de ejecución (raíz del proyecto).
        # Pasar una tupla permite múltiples archivos en orden de prioridad:
        #   .env.local sobreescribe .env (útil para overrides personales).
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        # False para que POSTGRES_HOST y postgres_host sean la misma variable.
        case_sensitive=False,
        # "ignore" para que variables extra en el .env no lancen ValidationError.
        extra="ignore",
        # Habilitar para que pydantic-settings intente parsear valores de lista
        # separados por comas sin necesidad de tipo especial.
        # (Activado por defecto en pydantic-settings >= 2.1.0)
    )

    # ── Entorno ────────────────────────────────────────────────────────────────
    app_env: str = "development"
    debug: bool = False

    # ── API ───────────────────────────────────────────────────────────────────
    api_v1_prefix: str = "/api/v1"
    project_name: str = "Plataforma Turística API"
    project_version: str = "1.0.0"

    # ── Base de datos PostgreSQL + PostGIS ────────────────────────────────────
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "turismo_db"
    postgres_user: str = "turismo_api"
    postgres_password: str = ""

    # Pool de conexiones (asyncpg)
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # URL construida por el validator — NO debe escribirse en el .env
    database_url: str = ""

    # ── Seguridad ─────────────────────────────────────────────────────────────
    secret_key: str = "cambia-esto-en-produccion-con-openssl-rand-hex-32"
    access_token_expire_minutes: int = 30

    # ── CORS ──────────────────────────────────────────────────────────────────
    #
    # TIPO CLAVE: list[AnyHttpUrl]
    #
    # AnyHttpUrl valida que cada origen tenga esquema (http:// o https://).
    # Esto previene que un typo como "localhost:5173" (sin esquema) pase
    # la validación silenciosamente y rompa CORS en producción.
    #
    # FORMATO EN .env:
    #   CORS_ORIGINS=http://localhost:5173,http://localhost:3000
    #
    # pydantic-settings 2.x parsea valores separados por comas hacia list[]
    # de forma nativa cuando el tipo es list[<cualquier_tipo>].
    # No se necesita validator, no se necesita json.loads().
    #
    # El campo se inicializa con los orígenes de desarrollo más comunes
    # para que la app funcione sin .env en entornos de CI básicos.
    cors_origins: list[AnyHttpUrl] = [
        "http://localhost:5173",   # Vite dev server (puerto por defecto)
        "http://localhost:3000",   # Create React App / alternativa común
        "http://127.0.0.1:5173",   # Algunas configs de Vite usan 127.0.0.1
    ]

    # ── Archivos estáticos ────────────────────────────────────────────────────
    static_dir: str = "static"
    uploads_dir: str = "static/uploads"

    # ── Validators ────────────────────────────────────────────────────────────

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parsear_cors_origins(cls, v: object) -> list[str]:
        """
        Validator defensivo de último recurso.

        pydantic-settings ya maneja el caso "comas" nativamente.
        Este validator cubre el caso donde alguien escribe el .env
        con formato JSON por costumbre:
            CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

        mode="before" significa que se ejecuta ANTES de que Pydantic
        intente convertir el valor al tipo declarado (list[AnyHttpUrl]).
        Recibe el valor crudo del .env como string.
        """
        if isinstance(v, str):
            stripped = v.strip()

            # Formato JSON: ["http://...","http://..."]
            if stripped.startswith("["):
                import json
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if item]
                except json.JSONDecodeError:
                    pass  # Caerá en el parseo por comas abajo

            # Formato comas: http://...,http://...
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]

        # Si ya es lista (valor por defecto de Python), devolverla tal cual
        if isinstance(v, list):
            return [str(item).strip() for item in v if item]

        return v  # Dejar que Pydantic lance el error de tipo correspondiente

    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        """
        Construye la URL de conexión asyncpg desde las partes individuales.
        Se ejecuta DESPUÉS de que todos los campos individuales fueron validados.

        No se declara database_url en el .env para evitar que quede desincronizada
        con los campos individuales (postgres_host, postgres_user, etc.).
        """
        self.database_url = (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
        return self

    # ── Propiedades computadas ────────────────────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def cors_origins_as_str(self) -> list[str]:
        """
        Convierte list[AnyHttpUrl] → list[str] para CORSMiddleware.

        CORSMiddleware de Starlette espera list[str], no list[AnyHttpUrl].
        AnyHttpUrl es un objeto de Pydantic que se serializa correctamente
        como str, pero hacemos la conversión explícita para evitar warnings.
        """
        return [str(origin).rstrip("/") for origin in self.cors_origins]
        #                        ^^^^^^^^
        # .rstrip("/") elimina el slash final que AnyHttpUrl agrega:
        # AnyHttpUrl("http://localhost:5173") → "http://localhost:5173/"
        # CORSMiddleware compara sin slash final → sin rstrip fallaría.


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Singleton de configuración. lru_cache garantiza que el .env
    se lea y valide una sola vez durante toda la vida del proceso.

    Para invalidar el caché en tests:
        from app.core.config import get_settings
        get_settings.cache_clear()
    """
    return Settings()


# Alias de conveniencia — usar `from app.core.config import settings`
# en lugar de importar get_settings() en cada módulo.
settings = get_settings()