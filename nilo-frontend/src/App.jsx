/**
 * src/App.jsx
 * ────────────
 * Raíz de la aplicación.
 * Incluye: layout, variables CSS globales, animaciones y ensamblaje de componentes.
 *
 * Estética elegida: cartografía editorial
 * - Paleta tierra / pergamino / oro oxidado
 * - Tipografía: "Playfair Display" (títulos) + "DM Sans" (UI)
 * - Textura de ruido sobre el header para profundidad
 * - Transiciones suaves, sin exceso de efectos
 */

import { useState, useEffect } from 'react'
import MapaTuristico from './components/MapaTuristico'
import AdminPanel from './components/AdminPanel'
import { healthService } from './services/api'
import EstadoConexion from './components/EstadoConexion'
import { useCatalogo } from './hooks/useCatalogo'

// ─── CSS GLOBAL ───────────────────────────────────────────────────────────────
// Declarado como string e inyectado vía <style> para tenerlo todo en un archivo.
// En un proyecto real va en src/index.css o archivos CSS Modules.
const ESTILOS_GLOBALES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=DM+Sans:wght@300;400;500&display=swap');

:root {
  --crema: #f5ede0;
  --crema-oscura: #ede0cc;
  --tierra: #6b4226;
  --tierra-claro: #9c6644;
  --dorado: #c8830a;
  --dorado-suave: #e8a94a;
  --verde-selva: #2d6a4f;
  --tinta: #1a1208;
  --tinta-suave: #3d2e1a;
  --gris-arena: #b0936e;
  --blanco: #fdfaf5;
  --fuente-titulo: 'Playfair Display', Georgia, serif;
  --fuente-ui: 'DM Sans', system-ui, sans-serif;
  --radio-sm: 6px;
  --radio-md: 12px;
  --radio-lg: 20px;
  --sombra-carta: 0 4px 24px rgba(26,18,8,0.12), 0 1px 4px rgba(26,18,8,0.08);
  --sombra-elevada: 0 12px 40px rgba(26,18,8,0.18);
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  scroll-behavior: smooth;
}

body {
  font-family: var(--fuente-ui);
  background-color: var(--crema);
  color: var(--tinta);
  line-height: 1.6;
  min-height: 100dvh;
}

/* ── Layout principal ── */
.app {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100dvh;
}

/* ── Header ── */
.app-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background-color: var(--tinta);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  border-bottom: 1px solid rgba(200,131,10,0.25);
  padding: 0 clamp(1rem, 4vw, 2.5rem);
}

.app-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1400px;
  margin: 0 auto;
  height: 64px;
  gap: 1rem;
}

.app-header__marca {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.app-header__emblema {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--dorado), var(--tierra));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(200,131,10,0.35);
}

.app-header__nombre {
  font-family: var(--fuente-titulo);
  font-size: clamp(1rem, 2.5vw, 1.25rem);
  font-weight: 700;
  color: var(--crema);
  letter-spacing: -0.01em;
  line-height: 1.1;
}

.app-header__nombre span {
  display: block;
  font-size: 0.6em;
  font-weight: 300;
  font-style: italic;
  color: var(--dorado-suave);
  letter-spacing: 0.08em;
}

.app-header__nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.nav-btn {
  background: transparent;
  border: none;
  color: var(--gris-arena);
  font-family: var(--fuente-ui);
  font-size: 0.875rem;
  font-weight: 400;
  padding: 0.5rem 0.875rem;
  border-radius: var(--radio-sm);
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
  letter-spacing: 0.01em;
}

.nav-btn:hover {
  color: var(--crema);
  background: rgba(255,255,255,0.06);
}

.nav-btn.activo {
  color: var(--dorado);
  font-weight: 500;
}

.nav-pill {
  background: var(--dorado);
  color: var(--tinta);
  border: none;
  font-family: var(--fuente-ui);
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 0.45rem 1.1rem;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
  letter-spacing: 0.01em;
}

.nav-pill:hover {
  background: var(--dorado-suave);
  transform: translateY(-1px);
}

.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--gris-arena);
  padding: 0.35rem 0.75rem;
  border: 1px solid rgba(176,147,110,0.25);
  border-radius: 999px;
  white-space: nowrap;
}

.status-dot__indicador {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gris-arena);
  transition: background 0.4s;
}

.status-dot--ok .status-dot__indicador {
  background: #4caf79;
  box-shadow: 0 0 6px #4caf7966;
}

.status-dot--error .status-dot__indicador {
  background: #e05252;
}

/* ── Main content ── */
.app-main {
  display: grid;
  grid-template-columns: 340px 1fr;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 4vw, 2.5rem);
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 900px) {
  .app-main {
    grid-template-columns: 1fr;
  }
  .panel-lateral {
    display: none;
  }
}

/* ── Panel lateral ── */
.panel-lateral {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: sticky;
  top: 80px;
}

.carta {
  background: var(--blanco);
  border: 1px solid var(--crema-oscura);
  border-radius: var(--radio-md);
  padding: 1.25rem 1.5rem;
  box-shadow: var(--sombra-carta);
}

.carta__etiqueta {
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--gris-arena);
  margin-bottom: 0.875rem;
}

.carta__titulo {
  font-family: var(--fuente-titulo);
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--tinta);
  line-height: 1.2;
  margin-bottom: 0.625rem;
}

.carta__descripcion {
  font-size: 0.875rem;
  color: var(--tierra-claro);
  line-height: 1.65;
  margin-bottom: 1.25rem;
}

.dato-fila {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-top: 1px solid var(--crema-oscura);
  font-size: 0.8125rem;
}

.dato-fila__clave {
  color: var(--gris-arena);
}

.dato-fila__valor {
  font-weight: 500;
  color: var(--tinta-suave);
}

.control-radio {
  margin-top: 1rem;
}

.control-radio label {
  display: block;
  font-size: 0.8125rem;
  color: var(--tierra-claro);
  margin-bottom: 0.5rem;
}

.control-radio input[type=range] {
  width: 100%;
  accent-color: var(--dorado);
  cursor: pointer;
}

.control-radio__valor {
  text-align: right;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--dorado);
  margin-top: 0.25rem;
}

/* ── Mapa ── */
.mapa-wrap {
  border-radius: var(--radio-lg);
  overflow: hidden;
  box-shadow: var(--sombra-elevada);
  border: 1px solid var(--crema-oscura);
  height: clamp(500px, 72vh, 800px);
}

/* ── Componente MapaTuristico interno ── */
.mapa-turistico {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--blanco);
}

.mapa-turistico__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 1rem 1.25rem 0.75rem;
  background: var(--blanco);
  border-bottom: 1px solid var(--crema-oscura);
  gap: 0.75rem;
  flex-wrap: wrap;
}

.mapa-turistico__eyebrow {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--dorado);
  font-weight: 500;
  display: block;
  margin-bottom: 2px;
}

.mapa-turistico__titulo {
  font-family: var(--fuente-titulo);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--tinta);
  line-height: 1.15;
}

.mapa-turistico__stats {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-shrink: 0;
}

.mapa-turistico__badge {
  background: var(--tinta);
  color: var(--crema);
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  letter-spacing: 0.02em;
}

.mapa-turistico__badge--cargando {
  background: var(--crema-oscura);
  color: var(--gris-arena);
  animation: pulso 1.4s ease-in-out infinite;
}

.mapa-turistico__radio {
  font-size: 0.75rem;
  color: var(--gris-arena);
}

.mapa-turistico__btn-refetch {
  background: transparent;
  border: 1px solid var(--crema-oscura);
  color: var(--tierra-claro);
  border-radius: var(--radio-sm);
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, transform 0.3s;
  flex-shrink: 0;
}

.mapa-turistico__btn-refetch:hover {
  background: var(--crema-oscura);
  color: var(--tinta);
}

.mapa-turistico__btn-refetch:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mapa-turistico__btn-refetch:not(:disabled):active {
  transform: rotate(180deg);
}

.mapa-turistico__error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: #fff4ec;
  border-bottom: 1px solid #f4c8a4;
  color: #c1440e;
  font-size: 0.8125rem;
}

.mapa-turistico__contenedor {
  flex: 1;
  position: relative;
  min-height: 0;
}

.mapa-turistico__contenedor .leaflet-container {
  height: 100%;
  font-family: var(--fuente-ui);
}

.mapa-turistico__leyenda {
  display: flex;
  gap: 1rem;
  padding: 0.625rem 1.25rem;
  background: var(--blanco);
  border-top: 1px solid var(--crema-oscura);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.leyenda-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  color: var(--tierra-claro);
  white-space: nowrap;
  font-weight: 500;
}

/* ── Skeleton ── */
.mapa-skeleton {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1rem;
  background: var(--crema);
}

.mapa-skeleton__pulse {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--crema-oscura);
  animation: pulso 1.4s ease-in-out infinite;
}

.mapa-skeleton__texto {
  font-size: 0.875rem;
  color: var(--gris-arena);
  font-style: italic;
}

/* ── Marcador origen ── */
.marcador-origen {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--dorado);
  border: 3px solid white;
  box-shadow: 0 2px 8px rgba(200,131,10,0.55);
  animation: pulso-origen 2s ease-in-out infinite;
}

/* ── Popups Leaflet ── */
.popup-nilo .leaflet-popup-content-wrapper {
  border-radius: var(--radio-md);
  border: 1px solid var(--crema-oscura);
  box-shadow: var(--sombra-carta);
  padding: 0;
  overflow: hidden;
}

.popup-nilo .leaflet-popup-content {
  margin: 0;
  width: auto !important;
}

.popup-nilo .leaflet-popup-tip-container {
  display: none;
}

.popup-nilo__contenido {
  padding: 0.875rem 1.125rem 1rem;
  min-width: 180px;
}

.popup-nilo__categoria {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--dorado);
  font-weight: 600;
  display: block;
  margin-bottom: 4px;
}

.popup-nilo__nombre {
  font-family: var(--fuente-titulo);
  font-size: 1rem;
  font-weight: 700;
  color: var(--tinta);
  line-height: 1.2;
  margin-bottom: 0.375rem;
}

.popup-nilo__municipio {
  font-size: 0.8rem;
  color: var(--tierra-claro);
  margin-bottom: 0.5rem;
}

.popup-nilo__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.popup-nilo__rating {
  font-size: 0.75rem;
  color: var(--dorado);
}

.popup-nilo__rating em {
  font-style: normal;
  margin-left: 4px;
  color: var(--gris-arena);
}

.popup-nilo__distancia {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--verde-selva);
  background: #e8f5ee;
  padding: 2px 8px;
  border-radius: 999px;
}

/* ── Footer ── */
.app-footer {
  text-align: center;
  padding: 1.5rem;
  font-size: 0.75rem;
  color: var(--gris-arena);
  border-top: 1px solid var(--crema-oscura);
  background: var(--blanco);
}

.app-footer a {
  color: var(--tierra-claro);
  text-decoration: none;
}

.app-footer a:hover {
  text-decoration: underline;
}

/* ── Animaciones ── */
@keyframes pulso {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

@keyframes pulso-origen {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(200,131,10,0.55);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 2px 20px rgba(200,131,10,0.8);
    transform: scale(1.12);
  }
}

@keyframes entrar {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.app-main {
  animation: entrar 0.45s ease both;
}
`

// ─── Componente App ───────────────────────────────────────────────────────────
export default function App() {
  const [radioM, setRadioM] = useState(5000)
  const [apiStatus, setApiStatus] = useState('comprobando')

  // ── Vista activa: turista ↔ admin ─────────────────────────────────────────────
  const [vistaActual, setVistaActual] = useState('turista')
  const [categoriaActiva, setCategoriaActiva] = useState(null)

  // ── Geolocalización del usuario ───────────────────────────────────────────────
  // Fallback a coordenadas de Nilo si el usuario deniega o hay error.
  const [lon, setLon] = useState(-74.634)
  const [lat, setLat] = useState(4.305)
  const [ubicacionCargando, setUbicacionCargando] = useState(true)

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude)
          setLon(position.coords.longitude)
          setUbicacionCargando(false)
        },
        (error) => {
          console.warn('Error obteniendo ubicación. Usando Nilo por defecto.', error)
          setUbicacionCargando(false)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else {
      setUbicacionCargando(false)
    }
  }, [])

  // ── Catálogo Offline-First ────────────────────────────────────────────────────
  // Un solo fetch a /api/v1/atractivos?por_pagina=1000 al montar la app.
  // Los datos se persisten en IndexedDB. El filtrado por radio se hace localmente
  // con Haversine, usando las coordenadas reales del usuario.
  const {
    estado:        estadoCatalogo,
    error:         errorCatalogo,
    estaOffline,
    datosDesdeCache,
    actualizadoEn,
    filtrar,
    forzarSincronizar,
  } = useCatalogo()

  // Verificar estado del backend al montar
  useEffect(() => {
    healthService
      .check()
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('error'))
  }, [])

  // Inyectar estilos globales (equivale a index.css en un proyecto normal)
  useEffect(() => {
    const tag = document.createElement('style')
    tag.textContent = ESTILOS_GLOBALES
    document.head.appendChild(tag)
    return () => document.head.removeChild(tag)
  }, [])

  const labelStatus = {
    comprobando: 'Conectando…',
    ok:    'API en línea',
    error: 'API inaccesible',
  }

  return (
    <div className="app">

      {/* ── HEADER ── */}
      <header className="app-header" role="banner">
        <div className="app-header__inner">
          <a href="/" className="app-header__marca" aria-label="Inicio — Nilo Destino Mágico">
            <div className="app-header__emblema" aria-hidden="true">🌿</div>
            <div className="app-header__nombre">
              Nilo
              <span>Destino Mágico</span>
            </div>
          </a>

          <nav className="app-header__nav" aria-label="Navegación principal">
            {/* Botones para alternar vistas */}
            <button
              className={`nav-btn ${vistaActual === 'turista' ? 'activo' : ''}`}
              onClick={() => setVistaActual('turista')}
            >
              Explorar Mapa
            </button>
            <button
              className={`nav-btn ${vistaActual === 'admin' ? 'activo' : ''}`}
              onClick={() => setVistaActual('admin')}
            >
              Administración
            </button>

            <div
              className={`status-dot status-dot--${apiStatus === 'comprobando' ? '' : apiStatus}`}
              role="status"
              aria-live="polite"
              title="Estado de la API"
            >
              <span className="status-dot__indicador" />
              {labelStatus[apiStatus]}
            </div>
          </nav>
        </div>
      </header>

      {/* ── MAIN CONDICIONAL (Muestra Turista o Admin) ── */}
      {vistaActual === 'admin' ? (
        <main role="main">
          <AdminPanel />
        </main>
      ) : (
        <main className="app-main" role="main">

          {/* Panel lateral izquierdo */}
          <aside className="panel-lateral" aria-label="Información del municipio">

            <div className="carta">
              <p className="carta__etiqueta">Cundinamarca · Colombia</p>
              <h1 className="carta__titulo">Nilo,<br/>Destino Mágico</h1>
              <p className="carta__descripcion">
                Municipio ribereño del río Magdalena, reconocido por su biodiversidad,
                turismo de naturaleza y el legado de la Hacienda Calandaima.
              </p>
              <div className="dato-fila">
                <span className="dato-fila__clave">Altitud</span>
                <span className="dato-fila__valor">354 m.s.n.m.</span>
              </div>
              <div className="dato-fila">
                <span className="dato-fila__clave">Temperatura</span>
                <span className="dato-fila__valor">28 °C promedio</span>
              </div>
              <div className="dato-fila">
                <span className="dato-fila__clave">Tu ubicación</span>
                <span className="dato-fila__valor">
                  {ubicacionCargando ? '…' : `${lat.toFixed(4)}°N, ${Math.abs(lon).toFixed(4)}°O`}
                </span>
              </div>
            </div>

            <div className="carta">
              <p className="carta__etiqueta">Filtrar búsqueda</p>
              <div className="control-radio">
                <label htmlFor="slider-radio">
                  Radio de búsqueda alrededor de tu ubicación
                </label>
                <input
                  id="slider-radio"
                  type="range"
                  min={1000}
                  max={20000}
                  step={500}
                  value={radioM}
                  onChange={(e) => setRadioM(Number(e.target.value))}
                />
                <p className="control-radio__valor">
                  {(radioM / 1000).toFixed(1)} km
                </p>
              </div>
            </div>

            <div className="carta">
              <p className="carta__etiqueta">Categorías</p>
              
              {/* Botón para resetear filtros (Ver Todas) */}
              <button 
                onClick={() => setCategoriaActiva(null)}
                style={{
                  width: '100%', padding: '8px', marginBottom: '12px',
                  background: categoriaActiva === null ? 'var(--dorado)' : 'transparent',
                  color: categoriaActiva === null ? 'white' : 'var(--tierra-claro)',
                  border: `1px solid ${categoriaActiva === null ? 'var(--dorado)' : 'var(--crema-oscura)'}`,
                  borderRadius: 'var(--radio-sm)', cursor: 'pointer',
                  fontWeight: categoriaActiva === null ? 'bold' : 'normal',
                  transition: 'all 0.2s'
                }}
              >
                🌍 Ver Todas
              </button>

              {/* Lista de categorías interactiva */}
              {[
                ['Patrimonio Cultural', '#c8830a'],
                ['Naturaleza',          '#2d6a4f'],
                ['Gastronomía',         '#c1440e'],
                ['Aventura',            '#1a4f8a'],
              ].map(([nombre, color]) => (
                <div 
                  className="dato-fila" 
                  key={nombre}
                  onClick={() => setCategoriaActiva(nombre)}
                  style={{ 
                    cursor: 'pointer',
                    background: categoriaActiva === nombre ? '#fff9f0' : 'transparent',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: categoriaActiva === nombre ? `1px solid ${color}` : '1px solid transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <span className="dato-fila__clave" style={{ display:'flex', alignItems:'center', gap:'8px', color: categoriaActiva === nombre ? 'var(--tinta)' : 'var(--gris-arena)', fontWeight: categoriaActiva === nombre ? 'bold' : 'normal' }}>
                    <svg width="12" height="12"><circle cx="6" cy="6" r="6" fill={color}/></svg>
                    {nombre}
                  </span>
                </div>
              ))}
            </div>
          </aside>

          {/* Mapa principal */}
          <div className="mapa-wrap" role="region" aria-label="Mapa interactivo de atractivos turísticos">
            {ubicacionCargando ? (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                fontStyle: 'italic',
                color: 'var(--gris-arena)',
              }}>
                Obteniendo coordenadas satelitales... 📍
              </div>
            ) : (
              <MapaTuristico
                lon={lon}
                lat={lat}
                radioM={radioM}
                altura="100%"
                filtrar={filtrar}
                categoriaActiva={categoriaActiva}
                estadoCatalogo={estadoCatalogo}
                errorCatalogo={errorCatalogo}
                estaOffline={estaOffline}
                datosDesdeCache={datosDesdeCache}
                actualizadoEn={actualizadoEn}
                forzarSincronizar={forzarSincronizar}
              />
            )}
          </div>

        </main>
      )}

      {/* ── FOOTER ── */}
      <footer className="app-footer" role="contentinfo">
        <p>
          © {new Date().getFullYear()} Nilo Destino Mágico ·{' '}
          Datos ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
            OpenStreetMap
          </a>{' '}
          · Plataforma turística con PostGIS + FastAPI + React
        </p>
      </footer>

      {/* ── BANNER DE SUPERVIVENCIA OFFLINE ── */}
      <EstadoConexion />

    </div>
  )
}