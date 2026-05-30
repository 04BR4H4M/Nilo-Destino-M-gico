/**
 * src/components/MapaTuristico.jsx
 * ─────────────────────────────────
 * Mapa interactivo de atractivos turísticos de Nilo, Cundinamarca.
 *
 * Arquitectura (Fase 5 - Offline-First):
 * - Recibe el catálogo y la función `filtrar` desde App.jsx (vía useCatalogo).
 * - El filtrado (distancia y dirección) se hace 100% en el cliente (JavaScript)
 * usando Haversine, permitiendo uso offline continuo y fluido.
 */

import { useMemo } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { calcularDistanciaLocal, calcularDireccionCardinal } from '../utils/geoCompass';

// ── Fix iconos Leaflet + Vite ──────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
})

// ── Coordenadas de Nilo, Cundinamarca ─────────────────────────────────────────
const NILO_CENTER = [4.305, -74.634]
const DEFAULT_RADIO_M = 5000

// ── Icono personalizado por categoría ─────────────────────────────────────────
const CATEGORIA_COLORES = {
  'Patrimonio Cultural': '#c8830a',
  'Naturaleza':          '#2d6a4f',
  'Gastronomía':         '#c1440e',
  'Aventura':            '#1a4f8a',
  default:               '#6b4226',
}

function crearIconoCategoria(categoria) {
  const color = CATEGORIA_COLORES[categoria] ?? CATEGORIA_COLORES.default
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
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -38],
  })
}

// ── Skeleton de carga ──────────────────────────────────────────────────────────
function MapaSkeleton({ mensaje = 'Cargando atractivos…' }) {
  return (
    <div className="mapa-skeleton" aria-busy="true" aria-label="Cargando mapa…">
      <div className="mapa-skeleton__pulse" />
      <p className="mapa-skeleton__texto">{mensaje}</p>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function MapaTuristico({
  lon = -74.634,
  lat = 4.305,
  radioM = DEFAULT_RADIO_M,
  altura = '100%',
  // 📍 Nuevos props que vienen de useCatalogo (App.jsx)
  filtrar,
  estadoCatalogo = 'idle',
  errorCatalogo = null,
  estaOffline = false,
  datosDesdeCache = false,
  actualizadoEn = null,
  forzarSincronizar,
}) { 
  
  // 1. Filtrado 100% local (instantáneo, sin red)
  const atractivosFiltrados = useMemo(() => {
    if (!filtrar) return []
    return filtrar(lat, lon, radioM)
  }, [filtrar, lat, lon, radioM])

  // 2. Memoizar iconos para no recrearlos
  const iconosPorCategoria = useMemo(() => {
    const mapa = {}
    atractivosFiltrados.forEach(({ categoria }) => {
      if (!mapa[categoria]) mapa[categoria] = crearIconoCategoria(categoria)
    })
    return mapa
  }, [atractivosFiltrados])

  // Estados del catálogo
  const cargandoInicial = estadoCatalogo === 'cargando-red' || estadoCatalogo === 'cargando-idb' || estadoCatalogo === 'idle'
  const revalidando = estadoCatalogo === 'revalidando'
  const sinDatos = estadoCatalogo === 'sin-datos'

  return (
    <section className="mapa-turistico" style={{ height: altura }}>

      {/* ── Cabecera con stats ── */}
      <header className="mapa-turistico__header">
        <div className="mapa-turistico__titulo-wrap">
          <span className="mapa-turistico__eyebrow">Nilo · Cundinamarca</span>
          <h2 className="mapa-turistico__titulo">Atractivos Cercanos</h2>
        </div>
        <div className="mapa-turistico__stats">
          {cargandoInicial ? (
            <span className="mapa-turistico__badge mapa-turistico__badge--cargando">
              {estadoCatalogo === 'cargando-idb' ? 'Leyendo caché…' : 'Descargando…'}
            </span>
          ) : (
            <span className="mapa-turistico__badge">
              {atractivosFiltrados.length} {atractivosFiltrados.length === 1 ? 'atractivo' : 'atractivos'}
            </span>
          )}
          <span className="mapa-turistico__radio">
            Radio: {(radioM / 1000).toFixed(1)} km
          </span>

          {/* Botón de recarga manual */}
          {forzarSincronizar && !estaOffline && (
            <button
              className="mapa-turistico__btn-refetch"
              onClick={forzarSincronizar}
              disabled={cargandoInicial || revalidando}
              aria-label="Recargar atractivos"
              title="Sincronizar"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M3 21v-5h5"/>
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* ── Banners de Error / Offline ── */}
      {errorCatalogo && (
        <div className="mapa-turistico__error" role="alert" style={{ marginBottom: '0', borderBottom: 'none', borderBottomLeftRadius: '0', borderBottomRightRadius: '0' }}>
          <span>{errorCatalogo}</span>
        </div>
      )}

      {estaOffline && !errorCatalogo && (
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem',
            background: '#1c1a10', borderBottom: '1px solid #8a5a20', fontSize: '0.75rem', color: '#c8830a',
          }}
        >
          Modo offline{' '}
          {datosDesdeCache && actualizadoEn
            ? `— datos de ${actualizadoEn.toLocaleDateString('es-CO')}`
            : '— sin datos'}
        </div>
      )}

      {/* ── Contenedor del mapa ── */}
      <div className="mapa-turistico__contenedor" style={{ borderTopLeftRadius: (estaOffline || errorCatalogo) ? '0' : '12px', borderTopRightRadius: (estaOffline || errorCatalogo) ? '0' : '12px' }}>
        {cargandoInicial && atractivosFiltrados.length === 0 ? (
          <MapaSkeleton mensaje={estadoCatalogo === 'cargando-idb' ? 'Leyendo datos guardados…' : 'Descargando catálogo de atractivos…'} />
        ) : sinDatos ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', padding: '2rem', textAlign: 'center', color: '#9c6644' }}>
            <span style={{ fontSize: '2.5rem' }}>🌿</span>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{errorCatalogo ?? 'Abre la app con conexión para descargar el catálogo.'}</p>
          </div>
        ) : (
          <MapContainer
            center={[lat, lon]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              maxZoom={19}
            />

            <Circle
              center={[lat, lon]}
              radius={radioM}
              pathOptions={{
                color: '#c8830a',
                weight: 1.5,
                opacity: 0.5,
                fillColor: '#c8830a',
                fillOpacity: 0.05,
                dashArray: '6 4',
              }}
            />

            <Marker
              position={[lat, lon]}
              icon={L.divIcon({
                html: `<div class="marcador-origen" title="Tu ubicación"></div>`,
                className: '',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            >
              <Popup className="popup-nilo popup-nilo--origen">
                <strong>Punto de búsqueda</strong>
                <span>{lat.toFixed(4)}, {lon.toFixed(4)}</span>
              </Popup>
            </Marker>

            {/* 📍 LOS MARCADORES DEL CATÁLOGO FILTRADOS LOCALMENTE */}
            {atractivosFiltrados.map((atractivo) => {
              const coords = parsearCoords(atractivo)
              if (!coords) return null

              const distanciaReal = calcularDistanciaLocal(lat, lon, coords[0], coords[1]);
              const direccion = calcularDireccionCardinal(lat, lon, coords[0], coords[1]);

              return (
                <Marker
                  key={atractivo.id}
                  position={coords}
                  icon={iconosPorCategoria[atractivo.categoria] ?? crearIconoCategoria(atractivo.categoria)}
                >
                  <Popup className="popup-nilo" maxWidth={260} minWidth={240}>
                    {atractivo.imagen_principal && (
                      <img
                      src={`${(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1').replace('/api/v1', '')}${atractivo.imagen_principal}`}
                        alt={atractivo.nombre}
                        style={{
                          width: '100%',
                          height: '140px',
                          objectFit: 'cover',
                          display: 'block',
                          borderTopLeftRadius: '12px',
                          borderTopRightRadius: '12px'
                        }}
                      />
                    )}

                    <div className="popup-nilo__contenido" style={{ padding: atractivo.imagen_principal ? '12px' : '' }}>
                      <span className="popup-nilo__categoria">{atractivo.categoria}</span>
                      <h3 className="popup-nilo__nombre" style={{ marginBottom: '6px' }}>{atractivo.nombre}</h3>
                      
                      {atractivo.descripcion_corta && (
                        <p style={{ 
                          fontSize: '0.8rem', color: '#5a6072', lineHeight: '1.4', margin: '0 0 10px 0' 
                        }}>
                          {atractivo.descripcion_corta}
                        </p>
                      )}

                      {atractivo.municipio && (
                        <p className="popup-nilo__municipio">📍 {atractivo.municipio}</p>
                      )}
                      
                      <div className="popup-nilo__meta">
                        {atractivo.calificacion != null && (
                          <span className="popup-nilo__rating">
                            {'★'.repeat(Math.round(atractivo.calificacion))}
                            {'☆'.repeat(5 - Math.round(atractivo.calificacion))}
                            <em>{atractivo.calificacion.toFixed(1)}</em>
                          </span>
                        )}
                        
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span className="popup-nilo__distancia" style={{ fontWeight: 'bold', color: '#2d6a4f' }}>
                            🚶 {formatearDistancia(distanciaReal)}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#5a6072', fontWeight: '500' }}>
                            {direccion}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        )}
      </div>

      {/* ── Leyenda de categorías ── */}
      {atractivosFiltrados.length > 0 && (
        <footer className="mapa-turistico__leyenda" aria-label="Leyenda del mapa">
          {Object.entries(CATEGORIA_COLORES)
            .filter(([cat]) => cat !== 'default' && atractivosFiltrados.some((a) => a.categoria === cat))
            .map(([cat, color]) => (
              <span key={cat} className="leyenda-item">
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <circle cx="5" cy="5" r="5" fill={color} />
                </svg>
                {cat}
              </span>
            ))}
        </footer>
      )}
    </section>
  )
}

// ── Utilidades ─────────────────────────────────────────────────────────────────
function formatearDistancia(metros) {
  if (!metros && metros !== 0) return ''
  if (metros < 1000) return `${Math.round(metros)} m`
  return `${(metros / 1000).toFixed(1)} km`
}