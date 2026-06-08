/**
 * src/components/MapaTuristico.jsx
 * ─────────────────────────────────
 * Rediseño visual: experiencia inmersiva Mobile-First tipo Google Maps.
 *
 * ARQUITECTURA VISUAL (nueva):
 *   ┌─────────────────────────────────────────┐
 *   │  Header flotante (glassmorphism)   z:50  │
 *   │  Chips de categorías               z:50  │
 *   ├─────────────────────────────────────────┤
 *   │                                          │
 *   │   MAPA (position:absolute 100%×100%)     │
 *   │              z:10                        │
 *   │                                          │
 *   ├─────────────────────────────────────────┤
 *   │  Controles flotantes (zoom/ubicación)z:40│
 *   │  Bottom Sheet                      z:30  │
 *   └─────────────────────────────────────────┘
 *
 * LÓGICA: INTACTA — ninguna línea de Haversine, filtrado, coordenadas
 *         ni manejo de catálogo fue modificada.
 */
import { useRutaOffline } from '../hooks/useRutaOffline'
import { useMemo, useState, useCallback, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
  Polyline
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import '../styles/mapa-turistico.css'

import { calcularDireccionCardinal, extraerCoords, haversineM } from '../utils/geoCompass'

// ── Fix iconos Leaflet + Vite ──────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
  shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
})

// ── Constantes (sin cambios) ──────────────────────────────────────────────────
const DEFAULT_RADIO_M = 5000

const CATEGORIA_COLORES = {
  'Patrimonio Cultural': '#c8830a',
  'Naturaleza':          '#2d6a4f',
  'Gastronomía':         '#c1440e',
  'Aventura':            '#1a4f8a',
  default:               '#6b4226',
}

const CATEGORIA_ICONOS = {
  'Patrimonio Cultural': '🏛️',
  'Naturaleza':          '🌿',
  'Gastronomía':         '🍽️',
  'Aventura':            '🧗',
}

// ── Funciones de lógica: INTACTAS ─────────────────────────────────────────────

function crearIconoCategoria(categoriaRaw) {
  const nombreCategoria = typeof categoriaRaw === 'object' && categoriaRaw !== null
    ? categoriaRaw.nombre
    : categoriaRaw
  const color = CATEGORIA_COLORES[nombreCategoria] ?? CATEGORIA_COLORES.default
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
      <filter id="sombra" x="-20%" y="-10%" width="140%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#00000055"/>
      </filter>
      <path filter="url(#sombra)"
        d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 24 14 24S28 23.33 28 14C28 6.27 21.73 0 14 0z"
        fill="${color}"/>
      <circle cx="14" cy="14" r="6" fill="white" opacity="0.9"/>
    </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -38] })
}

function obtenerNombreCategoria(cat) {
  if (!cat) return 'Desconocido'
  return typeof cat === 'object' ? cat.nombre : cat
}

function normalizarCategoria(nombreCat) {
  if (nombreCat === 'GastronomÃ­a') return 'Gastronomía'
  return nombreCat
}

function formatearDistancia(metros) {
  if (!metros && metros !== 0) return ''
  if (metros < 1000) return `${Math.round(metros)} m`
  return `${(metros / 1000).toFixed(1)} km`
}

// ── Componente auxiliar: controles de mapa flotantes ─────────────────────────
function ControlesFlotantes({ onCentrar, lat, lon }) {
  const map = useMap()

  const zoomIn  = useCallback(() => map.zoomIn(),  [map])
  const zoomOut = useCallback(() => map.zoomOut(), [map])
  const centrar = useCallback(() => {
    map.flyTo([lat, lon], 14, { duration: 1 })
    onCentrar?.()
  }, [map, lat, lon, onCentrar])

  return (
    <div className="map-controls">
      <button className="map-ctrl-btn" onClick={zoomIn}  aria-label="Acercar">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
      <div className="map-ctrl-divider" />
      <button className="map-ctrl-btn" onClick={zoomOut} aria-label="Alejar">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
      <div className="map-ctrl-divider" />
      <button className="map-ctrl-btn map-ctrl-btn--location" onClick={centrar} aria-label="Centrar mapa">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          <circle cx="12" cy="12" r="8" strokeOpacity="0.3"/>
        </svg>
      </button>
    </div>
  )
}

// ── Bottom Sheet ──────────────────────────────────────────────────────────────
// Añadimos onTrazarRuta y motorListo
function BottomSheet({ atractivo, onCerrar, lat: centroLat, lon: centroLon, onTrazarRuta, motorListo, onVerDetalle }){  
  const handleDragClose = useRef(null)

  if (!atractivo) return null

  const coords   = extraerCoords(atractivo)
  const distancia = atractivo.distancia_m ||
    (coords ? haversineM(centroLat, centroLon, coords[0], coords[1]) : null)
  const direccion = coords
    ? calcularDireccionCardinal(centroLat, centroLon, coords[0], coords[1])
    : null

  let nombreCategoria = obtenerNombreCategoria(atractivo.categoria)
  nombreCategoria = normalizarCategoria(nombreCategoria)

  const colorCat   = CATEGORIA_COLORES[nombreCategoria] ?? CATEGORIA_COLORES.default
  const iconoCat   = CATEGORIA_ICONOS[nombreCategoria] ?? '📍'
  const imagenUrl  = atractivo.imagen_principal
    ? `${(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1').replace('/api/v1', '')}${atractivo.imagen_principal}`
    : null

  const abrirNavegacion = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${coords[0]},${coords[1]}&travelmode=driving`
    window.open(url, '_blank', 'noopener')
  }

  return (
    <>
      {/* Overlay semi-transparente que cierra el sheet al tocar fuera */}
      <div className="bottom-sheet-overlay" onClick={onCerrar} aria-hidden="true" />

      <div
        className="bottom-sheet"
        role="dialog"
        aria-label={`Detalle: ${atractivo.nombre}`}
        aria-modal="true"
      >
        {/* Asa de arrastre */}
        <div className="bottom-sheet__handle" aria-hidden="true" />

        {/* Imagen de cabecera */}
        {imagenUrl ? (
          <div className="bottom-sheet__img-wrap">
            <img
              src={imagenUrl}
              alt={atractivo.nombre}
              className="bottom-sheet__img"
            />
            <div className="bottom-sheet__img-gradient" />
            <button
              className="bottom-sheet__close"
              onClick={onCerrar}
              aria-label="Cerrar panel"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        ) : (
          <div className="bottom-sheet__no-img" style={{ '--color-cat': colorCat }}>
            <span className="bottom-sheet__no-img-icon">{iconoCat}</span>
            <button
              className="bottom-sheet__close bottom-sheet__close--dark"
              onClick={onCerrar}
              aria-label="Cerrar panel"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        )}

        {/* Cuerpo del panel */}
        <div className="bottom-sheet__body">

          {/* Categoría + nombre */}
          <div className="bottom-sheet__cat-row">
            <span
              className="bottom-sheet__cat-chip"
              style={{ '--color-cat': colorCat }}
            >
              {iconoCat} {nombreCategoria}
            </span>
            {atractivo.calificacion != null && (
              <span className="bottom-sheet__rating">
                ★ {atractivo.calificacion.toFixed(1)}
              </span>
            )}
          </div>

          <h2 className="bottom-sheet__nombre">{atractivo.nombre}</h2>

          {atractivo.municipio && (
            <p className="bottom-sheet__municipio">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                <path d="M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
              </svg>
              {atractivo.municipio}
            </p>
          )}

          {/* Distancia + dirección */}
          {distancia != null && (
            <div className="bottom-sheet__dist-row">
              <div className="bottom-sheet__dist-pill">
                <span className="bottom-sheet__dist-num">{formatearDistancia(distancia)}</span>
              </div>
              {direccion && (
                <div className="bottom-sheet__dir-pill">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l7 18-7-4-7 4z"/>
                  </svg>
                  {direccion}
                </div>
              )}
            </div>
          )}

         {/* Descripción cortada para el Bottom Sheet */}
          {atractivo.descripcion_corta && (
            <p className="bottom-sheet__desc" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {atractivo.descripcion_corta}
            </p>
          )}

          {/* ── BOTONES DE ACCIÓN ── */}
          {coords && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button 
                className="bottom-sheet__nav-btn" 
                onClick={() => onTrazarRuta(coords[0], coords[1])}
                disabled={!motorListo}
                style={{
                  flex: 1, padding: '12px',
                  background: motorListo ? 'var(--verde-selva, #2d6a4f)' : 'var(--crema-oscura)',
                  color: motorListo ? '#fff' : 'var(--gris-arena)',
                  border: 'none', borderRadius: '12px', fontWeight: '600', 
                  cursor: motorListo ? 'pointer' : 'not-allowed',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 11l19-9-9 19-2-8-8-2z"/>
                </svg>
                {motorListo ? 'Cómo llegar' : 'Cargando...'}
              </button>

              <button 
                onClick={onVerDetalle}
                style={{
                  flex: 1, padding: '12px',
                  background: 'var(--crema-oscura, #ede0cc)',
                  color: 'var(--tinta, #1a1208)',
                  border: 'none', borderRadius: '12px', fontWeight: '600', 
                  cursor: 'pointer',
                  display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}
              >
                Conoce más
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Vista de Detalle (Pantalla Completa) ──────────────────────────────────────
function VistaDetalle({ atractivo, onCerrar, onTrazarRuta, motorListo, onVerEnMapa }) {
  if (!atractivo) return null;

  const coords = extraerCoords(atractivo);
  let nombreCategoria = normalizarCategoria(obtenerNombreCategoria(atractivo.categoria));
  const colorCat = CATEGORIA_COLORES[nombreCategoria] ?? CATEGORIA_COLORES.default;
  const imagenUrl = atractivo.imagen_principal
    ? `${(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1').replace('/api/v1', '')}${atractivo.imagen_principal}`
    : null;

  return (
    <div className="vista-detalle-full" style={{
      position: 'absolute', inset: 0, zIndex: 9999, background: 'var(--blanco, #fdfaf5)',
      overflowY: 'auto', animation: 'slideUp 0.3s ease-out', display: 'flex', flexDirection: 'column'
    }}>
      {/* Botón Flotante Volver */}
      <button onClick={onCerrar} style={{
        position: 'absolute', top: '20px', left: '20px', zIndex: 10000,
        background: 'rgba(26, 18, 8, 0.6)', color: 'white', border: 'none',
        padding: '8px 16px', borderRadius: '20px', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '500'
      }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Volver
      </button>

     {/* Hero inmersivo */}
<div
  style={{
    height: '45vh',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
    background: imagenUrl
      ? `url(${imagenUrl}) center/cover no-repeat`
      : colorCat,
  }}
>
  {/* Overlay degradado */}
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background:
        'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,.25), transparent)',
    }}
  />

  {/* Información sobre la imagen */}
  <div
    style={{
      position: 'absolute',
      bottom: '24px',
      left: '24px',
      right: '24px',
      zIndex: 2,
      color: '#fff',
    }}
  >
    <span
      style={{
        display: 'inline-block',
        background: 'rgba(255,255,255,.15)',
        backdropFilter: 'blur(8px)',
        padding: '6px 12px',
        borderRadius: '999px',
        fontSize: '0.8rem',
        fontWeight: '700',
        marginBottom: '12px',
      }}
    >
      {nombreCategoria}
    </span>

    <h1
      style={{
        margin: 0,
        fontSize: '2rem',
        fontWeight: '800',
        lineHeight: '1.1',
      }}
    >
      {atractivo.nombre}
    </h1>

    {atractivo.municipio && (
      <p
        style={{
          marginTop: '10px',
          marginBottom: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          opacity: 0.9,
          fontSize: '0.95rem',
        }}
      >
        📍 {atractivo.municipio}, Cundinamarca
      </p>
    )}
  </div>
</div>

{/* Contenido */}
<div
  style={{
    flex: 1,
    background: 'var(--blanco, #fdfaf5)',
    borderRadius: '24px 24px 0 0',
    marginTop: '-24px',
    padding: '30px 24px',
    position: 'relative',
  }}
>
  {/* Categoría */}
  <span
    style={{
      display: 'inline-block',
      background: `${colorCat}22`,
      color: colorCat,
      padding: '4px 12px',
      borderRadius: '8px',
      fontSize: '0.8rem',
      fontWeight: '700',
      textTransform: 'uppercase',
    }}
  >
    {nombreCategoria}
  </span>
<div
  style={{
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px',
    marginTop: '22px',
    marginBottom: '30px',
  }}
>
  {/* Cómo llegar */}
  <button
    onClick={() => {
      onCerrar();
      onTrazarRuta(coords[0], coords[1]);
    }}
    style={{
      background: '#fff',
      border: 'none',
      borderRadius: '18px',
      padding: '22px',
      boxShadow: '0 4px 16px rgba(0,0,0,.06)',
      cursor: 'pointer',
    }}
  >
    <div
      style={{
        fontSize: '2rem',
        marginBottom: '10px',
      }}
    >
      🧭
    </div>

    <div
      style={{
        fontWeight: '700',
        color: '#1a4f8a',
      }}
    >
      Cómo llegar
    </div>
  </button>

  {/* Ver mapa */}
  <button
  onClick={() => onVerEnMapa?.()}
  style={{
    background: '#fff',
    border: 'none',
    borderRadius: '18px',
    padding: '22px',
    boxShadow: '0 4px 16px rgba(0,0,0,.06)',
    cursor: 'pointer',
  }}
>
  <div
    style={{
      fontSize: '2rem',
      marginBottom: '10px',
    }}
  >
    🗺️
  </div>

  <div
    style={{
      fontWeight: '700',
      color: '#1a4f8a',
    }}
  >
    Ver en mapa
  </div>
</button>
</div>

  {/* Historia */}
 <div
  style={{
    marginBottom: '30px',
  }}
>
  <span
    style={{
      fontSize: '.85rem',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      color: '#9b8b76',
      fontWeight: '700',
    }}
  >
    Historia
  </span>

  <p
    style={{
      marginTop: '14px',
      color: 'var(--tinta-suave)',
      lineHeight: '1.8',
      fontSize: '1rem',
    }}
  >
    {atractivo.descripcion_corta}
  </p>
</div>
<div
  style={{
    background: '#fff',
    borderRadius: '20px',
    padding: '22px',
    boxShadow: '0 4px 16px rgba(0,0,0,.05)',
    marginBottom: '30px',
  }}
>
  <h3
    style={{
      marginTop: 0,
      marginBottom: '20px',
    }}
  >
    Información
  </h3>

  <div style={{ marginBottom: '18px' }}>
    <strong>Categoría</strong>
    <br />
    {nombreCategoria}
  </div>

  <div style={{ marginBottom: '18px' }}>
    <strong>Municipio</strong>
    <br />
    {atractivo.municipio || 'Nilo'}
  </div>

  <div>
    <strong>Tipo</strong>
    <br />
    Atractivo turístico
  </div>
</div>
  {/* Botón Trazar Ruta */}
  {coords && (
    <button
      onClick={() => {
        onCerrar();
        onTrazarRuta(coords[0], coords[1]);
      }}
      disabled={!motorListo}
      style={{
        width: '100%',
        padding: '16px',
        background: motorListo
          ? 'var(--dorado)'
          : 'var(--crema-oscura)',
        color: motorListo
          ? '#fff'
          : 'var(--gris-arena)',
        border: 'none',
        borderRadius: '14px',
        fontSize: '1.1rem',
        fontWeight: 'bold',
        cursor: motorListo ? 'pointer' : 'not-allowed',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '8px',
        boxShadow: motorListo
          ? '0 8px 24px rgba(200,131,10,0.3)'
          : 'none',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path d="M3 11l19-9-9 19-2-8-8-2z" />
      </svg>

      {motorListo
        ? 'Trazar ruta'
        : 'Cargando mapa offline...'}
    </button>
  )}
  </div>
</div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function MapaSkeleton({ mensaje = 'Cargando atractivos…' }) {
  return (
    <div className="mapa-skeleton" aria-busy="true">
      <div className="mapa-skeleton__pulse" />
      <p className="mapa-skeleton__texto">{mensaje}</p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function MapaTuristico({
  lon = -74.634,
  lat = 4.305,
  radioM = DEFAULT_RADIO_M,
  altura = '100%',
  filtrar,
  categoriaActiva,
  estadoCatalogo = 'idle',
  errorCatalogo = null,
  estaOffline = false,
  datosDesdeCache = false,
  actualizadoEn = null,
  forzarSincronizar,
  // Nuevos props opcionales para el header flotante
  onCategoriaChange,   // (cat: string|null) => void
  onRadioChange,       // (metros: number) => void
}) {

 // ── Estado visual del bottom sheet ─────────────────────────────────────────
  const [atractivoSeleccionado, setAtractivoSeleccionado] = useState(null)
  const [viendoDetalle, setViendoDetalle] = useState(false) // NUEVO ESTADO

  // 👇 INYECTAR HOOK Y ESTADO DE RUTA
  const { calcularRuta, motorListo } = useRutaOffline()
  const [rutaTrazada, setRutaTrazada] = useState(null)

  const trazarHaciaAtractivo = useCallback((destinoLat, destinoLon) => {
    const coordsRuta = calcularRuta(lat, lon, destinoLat, destinoLon)
    if (coordsRuta) {
      setRutaTrazada(coordsRuta)
      // Opcional: cerramos el panel para que el usuario vea la ruta completa
      setAtractivoSeleccionado(null) 
      setViendoDetalle(false)
    } else {
      alert("No hay un camino directo mapeado. Usa la brújula o acércate a una vía principal.")
    }
  }, [calcularRuta, lat, lon])

  const abrirSheet = useCallback((atractivo) => {
    setAtractivoSeleccionado(atractivo)
    setViendoDetalle(false)
  }, [])
  
  const cerrarSheet = useCallback(() => {
    setAtractivoSeleccionado(null)
    setViendoDetalle(false)
    setRutaTrazada(null)
  }, [])

// ── LÓGICA DE FILTRADO: ESTILO GOOGLE MAPS ──
  const atractivosFiltrados = useMemo(() => {
    // Si no hay función de filtrar (catálogo no cargado), devolvemos vacío
    if (!filtrar) return []
    
    // Obtenemos TODOS los atractivos (le pasamos un radio infinito o ignoramos el filtro)
    // Suponiendo que tu función filtrar() actual requería un radio, le pasamos un número gigante
    const todosLosAtractivos = filtrar(lat, lon, 9999999) 

    if (!categoriaActiva) return todosLosAtractivos

    // Filtramos solo por la categoría seleccionada en los chips
    return todosLosAtractivos.filter(atractivo => {
      let nombreCat = typeof atractivo.categoria === 'object'
        ? atractivo.categoria.nombre
        : atractivo.categoria
      if (nombreCat === 'GastronomÃ­a') nombreCat = 'Gastronomía'
      return nombreCat === categoriaActiva
    })
  }, [filtrar, lat, lon, categoriaActiva])

  const iconosPorCategoria = useMemo(() => {
    const mapa = {}
    atractivosFiltrados.forEach(({ categoria }) => {
      let nombreCat = typeof categoria === 'object' ? categoria.nombre : categoria
      if (nombreCat === 'GastronomÃ­a') nombreCat = 'Gastronomía'
      if (!mapa[nombreCat]) mapa[nombreCat] = crearIconoCategoria(nombreCat)
    })
    return mapa
  }, [atractivosFiltrados])

  const cargandoInicial = estadoCatalogo === 'cargando-red' || estadoCatalogo === 'cargando-idb' || estadoCatalogo === 'idle'
  const revalidando     = estadoCatalogo === 'revalidando'
  const sinDatos        = estadoCatalogo === 'sin-datos'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mapa-shell" style={{ height: altura }}>

      {/* ════════════════════════════════════════
          CAPA 1: MAPA BASE (posición absoluta)
          ════════════════════════════════════════ */}
      <div className="mapa-canvas">
        {cargandoInicial && atractivosFiltrados.length === 0 ? (
          <MapaSkeleton
            mensaje={estadoCatalogo === 'cargando-idb'
              ? 'Leyendo datos guardados…'
              : 'Descargando catálogo de atractivos…'}
          />
        ) : sinDatos ? (
          <div className="mapa-sin-datos">
            <span className="mapa-sin-datos__emoji">🌿</span>
            <p className="mapa-sin-datos__texto">
              {errorCatalogo ?? 'Abre la app con conexión para descargar el catálogo.'}
            </p>
          </div>
        ) : (
          <MapContainer
            center={[lat, lon]}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
              attribution='© OpenStreetMap'
              maxZoom={19}
            />

            {/* Marcador de origen */}
            <Marker
              position={[lat, lon]}
              icon={L.divIcon({
                html: `<div class="marcador-origen"></div>`,
                className: '',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            >
              <Popup className="popup-nilo popup-nilo--origen">
                <strong>Tu posición</strong>
                <span>{lat.toFixed(4)}, {lon.toFixed(4)}</span>
              </Popup>
            </Marker>

            {/* ── Marcadores del catálogo: LÓGICA INTACTA ── */}
            {atractivosFiltrados.map((atractivo) => {
              const coords = extraerCoords(atractivo)
              if (!coords) return null

              let nombreCategoria = typeof atractivo.categoria === 'object'
                ? atractivo.categoria.nombre
                : atractivo.categoria
              if (nombreCategoria === 'GastronomÃ­a') nombreCategoria = 'Gastronomía'
            
              return (
                <Marker
                  key={atractivo.id}
                  position={coords}
                  icon={iconosPorCategoria[nombreCategoria] ?? crearIconoCategoria(nombreCategoria)}
                  eventHandlers={{
                    // Clic en marcador → abre Bottom Sheet en lugar de Popup nativo
                    click: () => abrirSheet(atractivo),
                  }}
                />
              )
            })}

            {/* 👇 LA RUTA VA AQUÍ AFUERA, DESPUÉS DE LOS MARCADORES 👇 */}
            {rutaTrazada && (
              <Polyline 
                positions={rutaTrazada} 
                color="#1a4f8a" 
                weight={6} 
                opacity={0.8} 
                dashArray="10, 10" 
              />
            )}

            {/* Controles flotantes dentro del contexto del mapa */}
            <ControlesFlotantes onCentrar={cerrarSheet} lat={lat} lon={lon} />
          </MapContainer>
        )}
      </div>

      {/* ════════════════════════════════════════
          CAPA 2: HEADER FLOTANTE (glassmorphism)
          ════════════════════════════════════════ */}
      <header className="map-header">
        <div className="map-header__inner">

          {/* Logo + título */}
          <div className="map-header__brand">
            <span className="map-header__emblem" aria-hidden="true">🌿</span>
            <div className="map-header__titles">
              <span className="map-header__overline">Nilo · Cundinamarca</span>
              <span className="map-header__name">Destino Mágico</span>
            </div>
          </div>

          {/* Acciones derecha */}
          <div className="map-header__actions">
            {/* Indicador offline */}
            {estaOffline && (
              <span className="map-header__offline-badge" title="Sin conexión — datos desde caché">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                  <path d="M1.5 3.5l11 11M9.5 4.5A5 5 0 0 1 13 8M11 6.5A3 3 0 0 1 12 8M6.5 9.5A3 3 0 0 0 8 11M5.5 8A5 5 0 0 0 4 10M3 5.5A7.5 7.5 0 0 0 2 8"/>
                </svg>
                Offline
              </span>
            )}

            {/* Contador */}
            {!cargandoInicial && (
              <span className="map-header__count">
                {atractivosFiltrados.length}
                <span className="map-header__count-label">
                  {atractivosFiltrados.length === 1 ? ' lugar' : ' lugares'}
                </span>
              </span>
            )}

            {/* Botón sincronizar */}
            {forzarSincronizar && !estaOffline && (
              <button
                className="map-header__sync-btn"
                onClick={forzarSincronizar}
                disabled={cargandoInicial || revalidando}
                aria-label="Sincronizar catálogo"
                title="Actualizar desde el servidor"
              >
                {revalidando ? (
                  <span className="map-header__sync-spinner" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ── Chips de categorías ── */}
        {onCategoriaChange && (
          <div className="map-chips" role="group" aria-label="Filtrar por categoría">
            <button
              className={`map-chip ${!categoriaActiva ? 'map-chip--active' : ''}`}
              onClick={() => onCategoriaChange(null)}
            >
              Todas
            </button>
            {Object.entries(CATEGORIA_COLORES)
              .filter(([cat]) => cat !== 'default')
              .map(([cat, color]) => (
                <button
                  key={cat}
                  className={`map-chip ${categoriaActiva === cat ? 'map-chip--active' : ''}`}
                  style={{ '--chip-color': color }}
                  onClick={() => onCategoriaChange(cat)}
                >
                  {CATEGORIA_ICONOS[cat]} {cat}
                </button>
              ))}
          </div>
        )}

        {/* Error banner */}
        {errorCatalogo && (
          <div className="map-error-banner" role="alert">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="8" cy="8" r="7"/><path d="M8 5v4M8 11h.01" strokeLinecap="round"/>
            </svg>
            {errorCatalogo}
          </div>
        )}
      </header>

      {/* ════════════════════════════════════════
          CAPA 3: BOTTOM SHEET del atractivo
          ════════════════════════════════════════ */}
      <BottomSheet
        atractivo={atractivoSeleccionado}
        onCerrar={cerrarSheet}
        lat={lat}
        lon={lon}
        onTrazarRuta={trazarHaciaAtractivo}
        motorListo={motorListo}
        onVerDetalle={() => setViendoDetalle(true)}
        />

        {viendoDetalle && (
        <VistaDetalle
          atractivo={atractivoSeleccionado}
          onCerrar={() => setViendoDetalle(false)}
          onTrazarRuta={trazarHaciaAtractivo}
          motorListo={motorListo}
          onVerEnMapa={() => {
          setViendoDetalle(false)
          }}
        />
      )}

      {/* ── Atribución discreta ── */}
      <div className="mapa-atribucion">

        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
      </div>
    </div>
  )
}