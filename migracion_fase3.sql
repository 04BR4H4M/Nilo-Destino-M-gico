-- ============================================================
-- MIGRACIÓN: Fase 3 — Subida de imágenes para atractivos
-- Archivo: migrations/fase3_imagen_principal.sql
--
-- Ejecutar con:
--   psql -U turismo_api -d turismo_db -f migrations/fase3_imagen_principal.sql
--
-- Para revertir (rollback):
--   ALTER TABLE turismo.atractivos_turisticos DROP COLUMN IF EXISTS imagen_principal;
-- ============================================================

BEGIN;

-- ── 1. Agregar columna ──────────────────────────────────────────────────────
-- nullable=True: los atractivos existentes quedan con NULL hasta que se
-- les suba una imagen. Sin DEFAULT para no bloquear la tabla en escritura
-- durante la migración (PostgreSQL 11+ hace ADD COLUMN nullable sin rewrite).
ALTER TABLE turismo.atractivos_turisticos
    ADD COLUMN IF NOT EXISTS imagen_principal VARCHAR(500);

-- ── 2. Comentario descriptivo ───────────────────────────────────────────────
COMMENT ON COLUMN turismo.atractivos_turisticos.imagen_principal
    IS 'URL relativa de la imagen principal optimizada en WebP. '
       'Ej: /static/uploads/550e8400-e29b-41d4-a716-446655440000.webp';

-- ── 3. Índice parcial — solo filas que ya tienen imagen ─────────────────────
-- Útil para queries tipo "listar atractivos CON imagen" sin escanear NULLs.
CREATE INDEX IF NOT EXISTS idx_atractivos_con_imagen
    ON turismo.atractivos_turisticos (imagen_principal)
    WHERE imagen_principal IS NOT NULL;

-- ── 4. Verificación post-migración ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'turismo'
          AND table_name   = 'atractivos_turisticos'
          AND column_name  = 'imagen_principal'
    ) THEN
        RAISE EXCEPTION 'ERROR: La columna imagen_principal NO fue creada correctamente.';
    ELSE
        RAISE NOTICE 'OK: Columna imagen_principal verificada exitosamente.';
    END IF;
END;
$$;

COMMIT;