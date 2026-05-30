-- ============================================================
-- PLATAFORMA TURÍSTICA — Esquema PostgreSQL + PostGIS
-- Incluye: Atractivos, Prestadores (RNT), Rutas Históricas
-- Autor:  Arquitecto de Software
-- Versión: 1.0
-- SRID utilizado: 4326 (WGS 84 — coordenadas GPS estándar)
-- ============================================================

-- ------------------------------------------------------------
-- 0. EXTENSIONES
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- búsqueda textual difusa

-- ------------------------------------------------------------
-- 1. ESQUEMAS (separación de responsabilidades)
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS turismo;
CREATE SCHEMA IF NOT EXISTS geo;
CREATE SCHEMA IF NOT EXISTS auditoria;

SET search_path = turismo, public;

-- ============================================================
-- MÓDULO 1 — ATRACTIVOS TURÍSTICOS
-- ============================================================

-- 1.1 Catálogo de categorías
CREATE TABLE turismo.categorias_atractivo (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    icono       VARCHAR(100),                        -- nombre del icono (ej: "patrimonio-cultural")
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE turismo.categorias_atractivo
    IS 'Catálogo de tipos de atractivos (Patrimonio, Naturaleza, Aventura, Gastronomía, etc.)';

-- 1.2 Tabla principal de atractivos
CREATE TABLE turismo.atractivos_turisticos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          VARCHAR(255) NOT NULL,
    slug            VARCHAR(300) UNIQUE,              -- URL amigable
    descripcion     TEXT,
    descripcion_corta VARCHAR(500),

    -- Geometría: punto o polígono (ej: plaza vs parque natural)
    -- Usando geometry genérica para aceptar ambos tipos
    geom            geometry(GeometryZ, 4326),        -- GeometryZ soporta punto 3D y polígono
    tipo_geom       VARCHAR(20) NOT NULL
                        CHECK (tipo_geom IN ('POINT', 'POLYGON', 'MULTIPOLYGON')),

    -- Clasificación
    categoria_id    INTEGER NOT NULL
                        REFERENCES turismo.categorias_atractivo(id)
                        ON DELETE RESTRICT,

    -- Calidad y contenido
    calificacion    NUMERIC(3,2) CHECK (calificacion BETWEEN 0 AND 5),
    num_resenas     INTEGER NOT NULL DEFAULT 0,

    -- Información operativa
    horarios        JSONB,  -- {"lunes": "08:00-18:00", "sabado": "09:00-17:00", ...}
    precio_entrada  NUMERIC(12,2),
    moneda          CHAR(3) DEFAULT 'COP',
    acceso_libre    BOOLEAN DEFAULT FALSE,
    accesibilidad   JSONB,  -- {"silla_ruedas": true, "audio_guia": false, ...}

    -- Ubicación administrativa
    departamento    VARCHAR(100),
    municipio       VARCHAR(100),
    vereda          VARCHAR(100),
    direccion       TEXT,

    -- Control
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    verificado      BOOLEAN NOT NULL DEFAULT FALSE,   -- revisado por el equipo editorial
    creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actualizado_en  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    creado_por      UUID
);

COMMENT ON TABLE turismo.atractivos_turisticos
    IS 'Atractivos turísticos del territorio, con soporte para geometría puntual y poligonal';
COMMENT ON COLUMN turismo.atractivos_turisticos.geom
    IS 'Geometría en SRID 4326 (WGS84). Puede ser POINT (monumento, mirador) o POLYGON (parque, reserva).';
COMMENT ON COLUMN turismo.atractivos_turisticos.horarios
    IS 'Estructura JSON: {"lunes":"08:00-18:00","festivos":"Cerrado"}';

-- Índices espaciales e índices compuestos
CREATE INDEX idx_atractivos_geom
    ON turismo.atractivos_turisticos USING GIST (geom);
CREATE INDEX idx_atractivos_categoria
    ON turismo.atractivos_turisticos (categoria_id);
CREATE INDEX idx_atractivos_municipio
    ON turismo.atractivos_turisticos (municipio, activo);
CREATE INDEX idx_atractivos_nombre_trgm
    ON turismo.atractivos_turisticos USING GIN (nombre gin_trgm_ops);

-- Índice funcional para búsquedas geográficas por radio (PWA)
CREATE INDEX idx_atractivos_geog_centroid 
    ON turismo.atractivos_turisticos 
    USING GIST ( (CASE WHEN tipo_geom = 'POINT' THEN geom ELSE ST_Centroid(geom) END::geography) );

    
-- 1.3 Multimedia de atractivos
CREATE TABLE turismo.multimedia_atractivo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atractivo_id    UUID NOT NULL
                        REFERENCES turismo.atractivos_turisticos(id)
                        ON DELETE CASCADE,
    tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('FOTO', 'VIDEO', 'AUDIO', 'TOUR_360')),
    url             TEXT NOT NULL,
    url_thumbnail   TEXT,
    titulo          VARCHAR(255),
    descripcion     TEXT,
    orden           SMALLINT NOT NULL DEFAULT 0,
    es_principal    BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_multimedia_atractivo ON turismo.multimedia_atractivo (atractivo_id, orden);

-- Restricción: un solo elemento principal por atractivo
CREATE UNIQUE INDEX idx_multimedia_principal
    ON turismo.multimedia_atractivo (atractivo_id)
    WHERE es_principal = TRUE;

-- ============================================================
-- MÓDULO 2 — PRESTADORES DE SERVICIOS (RNT)
-- ============================================================

-- 2.1 Tipos de prestador (según Ley 300 y normativa MinCIT)
CREATE TABLE turismo.tipos_prestador (
    id          SERIAL PRIMARY KEY,
    codigo      VARCHAR(30) NOT NULL UNIQUE,          -- ej: 'HOTEL', 'RESTAURANTE', 'AGENCIA'
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT,
    requiere_estrellas BOOLEAN DEFAULT FALSE
);

INSERT INTO turismo.tipos_prestador (codigo, nombre, requiere_estrellas) VALUES
    ('HOTEL',           'Hotel',                            TRUE),
    ('HOSTAL',          'Hostal / Hostel',                  FALSE),
    ('APART_HOTEL',     'Aparta Hotel',                     TRUE),
    ('POSADA',          'Posada Turística',                 FALSE),
    ('CAMPING',         'Área de Camping',                  FALSE),
    ('RESTAURANTE',     'Restaurante Turístico',            FALSE),
    ('AGENCIA_VIAJES',  'Agencia de Viajes',               FALSE),
    ('GUIA_TURISMO',    'Guía de Turismo',                 FALSE),
    ('EMPRESA_TRANS',   'Empresa de Transporte Turístico', FALSE),
    ('PARQUE_TEMATICO', 'Parque Temático / Atracción',     TRUE);

-- 2.2 Tabla principal de prestadores (con validación RNT)
CREATE TABLE turismo.prestadores_servicio (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razon_social        VARCHAR(300) NOT NULL,
    nombre_comercial    VARCHAR(300),
    nit                 VARCHAR(20) UNIQUE,              -- NIT sin dígito de verificación

    -- RNT (Registro Nacional de Turismo — obligatorio según Ley 300/1996)
    rnt                 VARCHAR(20) UNIQUE NOT NULL,
    rnt_vencimiento     DATE NOT NULL,
    rnt_estado          VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'
                            CHECK (rnt_estado IN ('ACTIVO', 'VENCIDO', 'SUSPENDIDO', 'CANCELADO')),
    rnt_actualizado_en  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Tipo de prestador
    tipo_id             INTEGER NOT NULL
                            REFERENCES turismo.tipos_prestador(id)
                            ON DELETE RESTRICT,

    -- Clasificación (hoteles y parques)
    estrellas           SMALLINT CHECK (estrellas BETWEEN 1 AND 5),

    -- Geolocalización
    ubicacion           geometry(Point, 4326) NOT NULL,
    direccion           TEXT NOT NULL,
    municipio           VARCHAR(100) NOT NULL,
    departamento        VARCHAR(100) NOT NULL,

    -- Contacto
    telefono            VARCHAR(20),
    telefono_whatsapp   VARCHAR(20),
    email               VARCHAR(255),
    sitio_web           TEXT,

    -- Métricas
    calificacion        NUMERIC(3,2) CHECK (calificacion BETWEEN 0 AND 5),
    num_resenas         INTEGER NOT NULL DEFAULT 0,

    -- Capacidad (hoteles)
    num_habitaciones    SMALLINT,
    capacidad_personas  SMALLINT,

    -- Control
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    verificado          BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actualizado_en      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE turismo.prestadores_servicio
    IS 'Hoteles, restaurantes y demás prestadores inscritos en el RNT (Ley 300 de 1996 y Ley 1101 de 2006).';
COMMENT ON COLUMN turismo.prestadores_servicio.rnt
    IS 'Número del Registro Nacional de Turismo. Formato validado por trigger.';
COMMENT ON COLUMN turismo.prestadores_servicio.rnt_estado
    IS 'Estado del RNT: ACTIVO (vigente), VENCIDO (>1 año sin renovar), SUSPENDIDO, CANCELADO.';

CREATE INDEX idx_prestadores_ubicacion ON turismo.prestadores_servicio USING GIST (ubicacion);
CREATE INDEX idx_prestadores_tipo      ON turismo.prestadores_servicio (tipo_id, activo);
CREATE INDEX idx_prestadores_municipio ON turismo.prestadores_servicio (municipio, departamento);
CREATE INDEX idx_prestadores_rnt       ON turismo.prestadores_servicio (rnt, rnt_estado);
CREATE INDEX idx_prestadores_nombre_trgm
    ON turismo.prestadores_servicio USING GIN (razon_social gin_trgm_ops);

-- 2.3 Servicios y tarifas por prestador
CREATE TABLE turismo.servicios_prestador (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prestador_id    UUID NOT NULL
                        REFERENCES turismo.prestadores_servicio(id)
                        ON DELETE CASCADE,
    nombre          VARCHAR(200) NOT NULL,
    descripcion     TEXT,
    precio_desde    NUMERIC(12,2),
    precio_hasta    NUMERIC(12,2),
    moneda          CHAR(3) DEFAULT 'COP',
    incluye         TEXT[],                            -- array de beneficios incluidos
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_servicios_prestador ON turismo.servicios_prestador (prestador_id, activo);

-- ============================================================
-- MÓDULO 3 — RUTAS HISTÓRICAS
-- ============================================================

-- 3.1 Tabla principal de rutas (lineal — ej: Ruta del Himno Nacional)
CREATE TABLE turismo.rutas_historicas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre              VARCHAR(300) NOT NULL,
    codigo              VARCHAR(50) UNIQUE,            -- ej: 'RUTA-HIMNO-NAL-001'
    slug                VARCHAR(350) UNIQUE,
    descripcion_historica TEXT,
    descripcion_corta   VARCHAR(600),

    -- Geometría: LineString (ruta) o MultiLineString (con desvíos / variantes)
    trayectoria         geometry(MultiLineStringZ, 4326) NOT NULL,

    -- Métricas de la ruta
    longitud_km         NUMERIC(8,2),                 -- calculado desde la geometría
    dificultad          VARCHAR(20) CHECK (dificultad IN ('FACIL', 'MODERADA', 'DIFICIL', 'EXPERTO')),
    duracion_min        INTEGER,                       -- duración estimada total en minutos
    modo_recorrido      VARCHAR(20)[] DEFAULT ARRAY['A_PIE'],
                            -- posibles: A_PIE, BICICLETA, VEHICULO, ECUESTRE

    -- Contexto histórico
    epoca_inicio        SMALLINT,                      -- año de inicio del período histórico
    epoca_fin           SMALLINT,                      -- año de fin del período
    personajes          JSONB,                         -- [{"nombre": "...", "rol": "..."}]
    referencias         TEXT[],                        -- fuentes bibliográficas

    -- Puntos de inicio y fin (extraídos de la geometría para consultas rápidas)
    punto_inicio        geometry(PointZ, 4326),
    punto_fin           geometry(PointZ, 4326),

    -- Multimedia y recursos
    audio_guia_url      TEXT,                          -- narración audio de la ruta completa
    mapa_descargable_url TEXT,

    -- Control
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    publicado           BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actualizado_en      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE turismo.rutas_historicas
    IS 'Rutas turístico-históricas lineales. Geometría MultiLineStringZ en SRID 4326.';
COMMENT ON COLUMN turismo.rutas_historicas.trayectoria
    IS 'MultiLineString 3D (lon, lat, altitud). Permite rutas con variantes o tramos separados.';
COMMENT ON COLUMN turismo.rutas_historicas.codigo
    IS 'Ej: RUTA-HIMNO-NAL-001. Identifica la ruta para referencias externas.';

CREATE INDEX idx_rutas_trayectoria    ON turismo.rutas_historicas USING GIST (trayectoria);
CREATE INDEX idx_rutas_punto_inicio   ON turismo.rutas_historicas USING GIST (punto_inicio);
CREATE INDEX idx_rutas_dificultad     ON turismo.rutas_historicas (dificultad, activo);
CREATE INDEX idx_rutas_nombre_trgm
    ON turismo.rutas_historicas USING GIN (nombre gin_trgm_ops);

-- 3.2 Puntos de interés a lo largo de la ruta (paradas ordenadas)
CREATE TABLE turismo.puntos_ruta (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruta_id             UUID NOT NULL
                            REFERENCES turismo.rutas_historicas(id)
                            ON DELETE CASCADE,
    atractivo_id        UUID
                            REFERENCES turismo.atractivos_turisticos(id)
                            ON DELETE SET NULL,

    -- Para paradas que no son atractivos registrados
    nombre_parada       VARCHAR(255),
    descripcion_parada  TEXT,
    geom_parada         geometry(PointZ, 4326),        -- coords si no hay atractivo vinculado

    -- Configuración de la parada
    orden_visita        SMALLINT NOT NULL,
    tiempo_estancia_min INTEGER DEFAULT 30,
    es_obligatoria      BOOLEAN NOT NULL DEFAULT TRUE,
    notas_guia          TEXT,                          -- instrucciones para el guía turístico

    CONSTRAINT chk_parada_tiene_referencia
        CHECK (atractivo_id IS NOT NULL OR (nombre_parada IS NOT NULL AND geom_parada IS NOT NULL))
);

COMMENT ON TABLE turismo.puntos_ruta
    IS 'Paradas ordenadas de cada ruta. Pueden ser atractivos registrados o puntos personalizados.';

CREATE UNIQUE INDEX idx_puntos_ruta_orden
    ON turismo.puntos_ruta (ruta_id, orden_visita);
CREATE INDEX idx_puntos_ruta_atractivo
    ON turismo.puntos_ruta (atractivo_id)
    WHERE atractivo_id IS NOT NULL;

-- 3.3 Servicios asociados a cada ruta (qué prestadores la atienden)
CREATE TABLE turismo.servicios_ruta (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruta_id         UUID NOT NULL
                        REFERENCES turismo.rutas_historicas(id)
                        ON DELETE CASCADE,
    prestador_id    UUID NOT NULL
                        REFERENCES turismo.prestadores_servicio(id)
                        ON DELETE CASCADE,
    tipo_servicio   VARCHAR(50) NOT NULL
                        CHECK (tipo_servicio IN ('ALOJAMIENTO','ALIMENTACION','TRANSPORTE','GUIANZA','ENTRADA')),
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE (ruta_id, prestador_id, tipo_servicio)
);

CREATE INDEX idx_servicios_ruta_ruta ON turismo.servicios_ruta (ruta_id);
CREATE INDEX idx_servicios_ruta_prestador ON turismo.servicios_ruta (prestador_id);

-- ============================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================

-- F1: Actualizar timestamp automáticamente
CREATE OR REPLACE FUNCTION turismo.fn_actualizar_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atractivos_ts
    BEFORE UPDATE ON turismo.atractivos_turisticos
    FOR EACH ROW EXECUTE FUNCTION turismo.fn_actualizar_timestamp();

CREATE TRIGGER trg_prestadores_ts
    BEFORE UPDATE ON turismo.prestadores_servicio
    FOR EACH ROW EXECUTE FUNCTION turismo.fn_actualizar_timestamp();

CREATE TRIGGER trg_rutas_ts
    BEFORE UPDATE ON turismo.rutas_historicas
    FOR EACH ROW EXECUTE FUNCTION turismo.fn_actualizar_timestamp();

-- F2: Validar formato RNT (ej: número con 3–15 dígitos, puede incluir guiones)
CREATE OR REPLACE FUNCTION turismo.fn_validar_rnt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Formato RNT Colombia: entre 3 y 20 caracteres alfanuméricos con guiones opcionales
    IF NEW.rnt !~ '^[A-Z0-9\-]{3,20}$' THEN
        RAISE EXCEPTION 'RNT inválido: %. Debe tener entre 3 y 20 caracteres alfanuméricos.', NEW.rnt;
    END IF;

    -- Actualizar estado automáticamente si está vencido
    IF NEW.rnt_vencimiento < CURRENT_DATE AND NEW.rnt_estado = 'ACTIVO' THEN
        NEW.rnt_estado = 'VENCIDO';
        RAISE WARNING 'RNT % marcado como VENCIDO (venció el %)', NEW.rnt, NEW.rnt_vencimiento;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_rnt
    BEFORE INSERT OR UPDATE OF rnt, rnt_vencimiento
    ON turismo.prestadores_servicio
    FOR EACH ROW EXECUTE FUNCTION turismo.fn_validar_rnt();

-- F3: Auto-calcular longitud de ruta y extraer puntos extremos
CREATE OR REPLACE FUNCTION turismo.fn_calcular_metricas_ruta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Longitud en kilómetros (ST_Length en geografía da metros)
    IF NEW.trayectoria IS NOT NULL THEN
        NEW.longitud_km = ROUND(
            CAST(ST_Length(NEW.trayectoria::geography) / 1000 AS NUMERIC), 3
        );
        -- Punto de inicio: primer vértice del primer LineString
        NEW.punto_inicio = ST_StartPoint(ST_GeometryN(NEW.trayectoria, 1));
        -- Punto de fin: último vértice del último LineString
        NEW.punto_fin    = ST_EndPoint(
            ST_GeometryN(NEW.trayectoria, ST_NumGeometries(NEW.trayectoria))
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_metricas_ruta
    BEFORE INSERT OR UPDATE OF trayectoria
    ON turismo.rutas_historicas
    FOR EACH ROW EXECUTE FUNCTION turismo.fn_calcular_metricas_ruta();

-- F4: Generar slug automático desde el nombre
CREATE OR REPLACE FUNCTION turismo.fn_generar_slug(p_texto TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN LOWER(
        REGEXP_REPLACE(
            TRANSLATE(
                p_texto,
                'áéíóúÁÉÍÓÚàèìòùüñÑ',
                'aeiouAEIOUaeiouun N'
            ),
            '[^a-z0-9]+', '-', 'g'
        )
    );
END;
$$;

-- ============================================================
-- VISTAS ÚTILES
-- ============================================================

-- V1: Prestadores con RNT próximo a vencer (próximos 60 días)
CREATE VIEW turismo.v_rnt_por_vencer AS
SELECT
    id, razon_social, rnt, rnt_vencimiento,
    (rnt_vencimiento - CURRENT_DATE) AS dias_restantes,
    municipio, email, telefono
FROM turismo.prestadores_servicio
WHERE
    rnt_estado = 'ACTIVO'
    AND rnt_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
ORDER BY rnt_vencimiento;

-- V2: Mapa de atractivos con centroide (para puntos en el mapa cuando son polígonos)
CREATE VIEW turismo.v_atractivos_mapa AS
SELECT
    a.id,
    a.nombre,
    a.slug,
    a.descripcion_corta,
    c.nombre   AS categoria,
    c.icono    AS categoria_icono,
    a.calificacion,
    a.municipio,
    a.tipo_geom,
    -- Para polígonos devolvemos el centroide; para puntos, el punto mismo
    CASE
        WHEN a.tipo_geom = 'POINT' THEN a.geom
        ELSE ST_Centroid(a.geom)
    END AS punto_mapa,
    a.activo,
    a.verificado
FROM turismo.atractivos_turisticos a
JOIN turismo.categorias_atractivo c ON c.id = a.categoria_id
WHERE a.activo = TRUE;

-- V3: Detalle completo de rutas históricas con conteo de paradas
CREATE VIEW turismo.v_rutas_detalle AS
SELECT
    r.id,
    r.nombre,
    r.codigo,
    r.descripcion_corta,
    r.longitud_km,
    r.dificultad,
    r.duracion_min,
    r.modo_recorrido,
    r.epoca_inicio,
    r.epoca_fin,
    r.punto_inicio,
    r.punto_fin,
    COUNT(pr.id) AS total_paradas,
    COUNT(sr.id) AS total_servicios
FROM turismo.rutas_historicas r
LEFT JOIN turismo.puntos_ruta pr ON pr.ruta_id = r.id
LEFT JOIN turismo.servicios_ruta sr ON sr.ruta_id = r.id AND sr.activo = TRUE
WHERE r.activo = TRUE
GROUP BY r.id;

-- ============================================================
-- FUNCIONES DE CONSULTA ESPACIAL
-- ============================================================

-- Buscar atractivos dentro de un radio (en metros) desde un punto lon/lat
CREATE OR REPLACE FUNCTION turismo.fn_atractivos_cercanos(
    p_lon       FLOAT,
    p_lat       FLOAT,
    p_radio_m   INTEGER DEFAULT 5000
)
RETURNS TABLE (
    id          UUID,
    nombre      VARCHAR,
    categoria   VARCHAR,
    distancia_m FLOAT,
    punto_mapa  geometry
) LANGUAGE sql STABLE AS $$
    SELECT
        a.id,
        a.nombre,
        c.nombre,
        ROUND(CAST(
            ST_Distance(
                CASE WHEN a.tipo_geom = 'POINT' THEN a.geom ELSE ST_Centroid(a.geom) END::geography,
                ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
            ) AS NUMERIC
        ), 2) AS distancia_m,
        CASE WHEN a.tipo_geom = 'POINT' THEN a.geom ELSE ST_Centroid(a.geom) END AS punto_mapa
    FROM turismo.atractivos_turisticos a
    JOIN turismo.categorias_atractivo c ON c.id = a.categoria_id
    WHERE
        a.activo = TRUE
        AND ST_DWithin(
            CASE WHEN a.tipo_geom = 'POINT' THEN a.geom ELSE ST_Centroid(a.geom) END::geography,
            ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
            p_radio_m
        )
    ORDER BY distancia_m;
$$;

-- Buscar prestadores cercanos a un atractivo dado
CREATE OR REPLACE FUNCTION turismo.fn_prestadores_cerca_atractivo(
    p_atractivo_id  UUID,
    p_radio_m       INTEGER DEFAULT 2000,
    p_tipo          VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id              UUID,
    nombre          VARCHAR,
    tipo            VARCHAR,
    rnt             VARCHAR,
    distancia_m     FLOAT,
    calificacion    NUMERIC
) LANGUAGE sql STABLE AS $$
    WITH centro AS (
        SELECT
            CASE WHEN tipo_geom = 'POINT' THEN geom ELSE ST_Centroid(geom) END AS g
        FROM turismo.atractivos_turisticos WHERE id = p_atractivo_id
    )
    SELECT
        p.id,
        COALESCE(p.nombre_comercial, p.razon_social),
        t.nombre,
        p.rnt,
        ROUND(CAST(ST_Distance(p.ubicacion::geography, c.g::geography) AS NUMERIC), 2),
        p.calificacion
    FROM turismo.prestadores_servicio p
    JOIN turismo.tipos_prestador t ON t.id = p.tipo_id, centro c
    WHERE
        p.activo = TRUE
        AND p.rnt_estado = 'ACTIVO'
        AND ST_DWithin(p.ubicacion::geography, c.g::geography, p_radio_m)
        AND (p_tipo IS NULL OR t.codigo = p_tipo)
    ORDER BY ST_Distance(p.ubicacion::geography, c.g::geography);
$$;

-- ============================================================
-- DATOS SEMILLA (RUTA DEL HIMNO NACIONAL — ejemplo)
-- ============================================================

-- Insertar categoría de ejemplo
INSERT INTO turismo.categorias_atractivo (nombre, descripcion, icono) VALUES
    ('Patrimonio Cultural', 'Monumentos, plazas y edificios de valor histórico', 'patrimonio'),
    ('Naturaleza',          'Parques naturales, ríos y ecosistemas',              'naturaleza'),
    ('Gastronomía',         'Restaurantes y mercados con gastronomía típica',     'gastronomia'),
    ('Aventura',            'Deportes extremos y ecoturismo activo',              'aventura');

-- Insertar la Ruta del Himno Nacional 
-- Nota: coordenadas simplificadas para ilustración
INSERT INTO turismo.rutas_historicas (
    nombre, codigo, descripcion_historica,
    trayectoria, dificultad, duracion_min, modo_recorrido,
    epoca_inicio, epoca_fin, publicado
) VALUES (
    'Ruta Cuna del Himno Nacional',
    'RUTA-HIMNO-NAL-001',
    'Recorrido patrimonial en Nilo, Cundinamarca. Visita al Museo Oreste Sindici y los lugares históricos donde se compuso la música del Himno Nacional en 1887.',
    ST_GeomFromText(
        'MULTILINESTRINGZ(
            (-74.6340 4.3050 400, -74.6355 4.3065 405, -74.6380 4.3080 410)
        )', 
        4326
    ),
    'FACIL', 120,
    ARRAY['A_PIE'],
    1887, 1887,
    TRUE
);

-- ============================================================
-- PERMISOS (ejemplo con roles de aplicación)
-- ============================================================

-- Crear roles si no existen
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'turismo_api') THEN
        CREATE ROLE turismo_api LOGIN PASSWORD 'cambiar_en_produccion';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'turismo_readonly') THEN
        CREATE ROLE turismo_readonly LOGIN PASSWORD 'cambiar_en_produccion';
    END IF;
END
$$;

-- API backend: lectura y escritura sobre tablas de negocio
GRANT USAGE ON SCHEMA turismo TO turismo_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA turismo TO turismo_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA turismo TO turismo_api;

-- Solo lectura para reportes y analytics
GRANT USAGE ON SCHEMA turismo TO turismo_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA turismo TO turismo_readonly;

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================