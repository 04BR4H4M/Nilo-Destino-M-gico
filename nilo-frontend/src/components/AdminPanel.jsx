/**
 * src/components/AdminPanel.jsx  —  v2: Crear + Editar
 * ──────────────────────────────────────────────────────
 * Panel de administración del backoffice turístico.
 *
 * Layout de dos columnas:
 *   IZQUIERDA  → Tabla de atractivos con botones Editar y Eliminar.
 *   DERECHA    → Formulario dual: crea o edita según `idEditando`.
 *
 * Cambios v2 respecto a v1:
 *   1. AtractivoFila recibe `onEditar` + `idEditando` para resaltar la fila activa.
 *   2. `parsearGeomWkt()` extrae lat/lon de "POINT Z (lon lat alt)" o "POINT (lon lat)".
 *   3. `handleEditar()` llena el form y hace flyTo en el mapa usando una ref al mapa.
 *   4. `VoladorMapa` — componente interno que lee un ref de Leaflet para animar el vuelo.
 *   5. `handleSubmit` bifurca entre create() y update() según `idEditando`.
 *   6. Títulos y botón de submit son dinámicos.
 *   7. "Cancelar Edición" limpia idEditando + resetea form.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { atractivosService } from '../services/api'

// ── Fix iconos Leaflet + Vite ─────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
  shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
})

// Icono rojo para el pin del formulario
const ICONO_PIN = L.divIcon({
  html: `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
      <filter id="s"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#00000066"/></filter>
      <path filter="url(#s)"
        d="M16 0C7.16 0 0 7.16 0 16c0 10.67 16 28 16 28S32 26.67 32 16C32 7.16 24.84 0 16 0z"
        fill="#e63946"/>
      <circle cx="16" cy="16" r="7" fill="white" opacity="0.95"/>
      <circle cx="16" cy="16" r="3.5" fill="#e63946"/>
    </svg>`,
  className: '',
  iconSize:    [32, 44],
  iconAnchor:  [16, 44],
  popupAnchor: [0, -44],
})

// Icono naranja para indicar "en edición"
const ICONO_PIN_EDICION = L.divIcon({
  html: `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
      <filter id="se"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#00000066"/></filter>
      <path filter="url(#se)"
        d="M16 0C7.16 0 0 7.16 0 16c0 10.67 16 28 16 28S32 26.67 32 16C32 7.16 24.84 0 16 0z"
        fill="#f4a261"/>
      <circle cx="16" cy="16" r="7" fill="white" opacity="0.95"/>
      <circle cx="16" cy="16" r="3.5" fill="#f4a261"/>
    </svg>`,
  className: '',
  iconSize:    [32, 44],
  iconAnchor:  [16, 44],
  popupAnchor: [0, -44],
})

// ── Constantes ────────────────────────────────────────────────────────────────
const NILO = { lat: 4.305, lon: -74.634 }

const CATEGORIAS = [
  { id: 1, nombre: 'Patrimonio Cultural', color: '#c8830a' },
  { id: 2, nombre: 'Naturaleza',          color: '#2d6a4f' },
  { id: 3, nombre: 'Gastronomía',         color: '#c1440e' },
  { id: 4, nombre: 'Aventura',            color: '#1a4f8a' },
]

const FORM_INICIAL = {
  nombre:            '',
  descripcion_corta: '',
  categoria_id:      '',
  lat:               null,
  lon:               null,
}

// ── Utilidad: parsear geom_wkt → { lat, lon } ─────────────────────────────────
// Acepta: "POINT Z (-74.634 4.305 0)"  o  "POINT (-74.634 4.305)"
// Devuelve null si el WKT no es parseable (graceful degradation).
function parsearGeomWkt(wkt) {
  if (!wkt) return null
  // Captura el primer y segundo número flotante después de "POINT" y "("
  // El tercer grupo (altitud) es opcional.
  const m = wkt.match(/POINT[^(]*\(\s*([-\d.]+)\s+([-\d.]+)/)
  if (!m) return null
  const lon = parseFloat(m[1])
  const lat = parseFloat(m[2])
  if (isNaN(lat) || isNaN(lon)) return null
  return { lat, lon }
}

// ── Subcomponente: captura clics en el mapa ───────────────────────────────────
function CapturadorClics({ onClic }) {
  useMapEvents({ click: (e) => onClic(e.latlng.lat, e.latlng.lng) })
  return null
}
// ── Subcomponente: Fuerza al mapa a recalcular su tamaño al abrir la pestaña
function FixMapSize() {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize()
    }, 250)
  }, [map])
  return null
}

// ── Subcomponente: vuela al pin cuando cambia la posición de edición ──────────
// Necesita vivir dentro de <MapContainer> para acceder al contexto de Leaflet.
// Recibe `destino` = { lat, lon } | null. Vuela solo cuando cambia.
function VoladorMapa({ destino }) {
  const map = useMap()
  const prevDestino = useRef(null)

  useEffect(() => {
    if (!destino) return
    const mismoLugar =
      prevDestino.current &&
      prevDestino.current.lat === destino.lat &&
      prevDestino.current.lon === destino.lon
    if (!mismoLugar) {
      map.flyTo([destino.lat, destino.lon], 15, { duration: 1.2 })
      prevDestino.current = destino
    }
  }, [destino, map])

  return null
}

// ── CSS completo (inyectado como <style> al montar) ───────────────────────────
const CSS_ADMIN = `
  .admin-panel {
    display: grid;
    grid-template-columns: 420px 1fr;
    gap: 0;
    min-height: calc(100dvh - 64px);
    background: #0f1117;
    font-family: var(--fuente-ui, 'DM Sans', system-ui, sans-serif);
    animation: entrar 0.3s ease both;
  }
  @media (max-width: 1024px) { .admin-panel { grid-template-columns: 1fr; } }

  /* ── Lista ── */
  .admin-lista {
    background: #161920;
    border-right: 1px solid #252830;
    display: flex;
    flex-direction: column;
    height: calc(100dvh - 64px);
    overflow: hidden;
    position: sticky;
    top: 64px;
  }
  .admin-lista__header {
    padding: 1.5rem 1.5rem 1rem;
    border-bottom: 1px solid #252830;
    flex-shrink: 0;
  }
  .admin-lista__titulo {
    font-family: var(--fuente-titulo, Georgia, serif);
    font-size: 1.125rem; font-weight: 700; color: #f0eee8;
    margin-bottom: 0.25rem; line-height: 1.2;
  }
  .admin-lista__subtitulo { font-size: 0.75rem; color: #5a6072; letter-spacing: 0.04em; }
  .admin-lista__body {
    flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 0.5rem 0;
  }
  .admin-lista__body::-webkit-scrollbar { width: 4px; }
  .admin-lista__body::-webkit-scrollbar-track { background: transparent; }
  .admin-lista__body::-webkit-scrollbar-thumb { background: #252830; border-radius: 2px; }

  /* ── Fila de atractivo ── */
  .atractivo-fila {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.75rem 1.25rem; border-bottom: 1px solid #1e2128;
    transition: background 0.15s;
  }
  .atractivo-fila:hover { background: #1c2030; }
  /* Fila resaltada cuando está siendo editada */
  .atractivo-fila--editando {
    background: #1c1a10 !important;
    border-left: 2px solid #f4a261;
    padding-left: calc(1.25rem - 2px);
  }

  .atractivo-fila__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .atractivo-fila__info { flex: 1; min-width: 0; }
  .atractivo-fila__nombre {
    font-size: 0.8125rem; font-weight: 500; color: #d8d4cc;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3;
  }
  .atractivo-fila__meta { display: flex; gap: 0.5rem; align-items: center; margin-top: 2px; }
  .atractivo-fila__cat { font-size: 0.6875rem; color: #5a6072; letter-spacing: 0.03em; }
  .atractivo-fila__municipio { font-size: 0.6875rem; color: #3d4455; }

  /* ── Botones de acción en fila ── */
  .fila-acciones { display: flex; gap: 4px; flex-shrink: 0; }

  .btn-editar, .btn-eliminar {
    background: transparent; border: 1px solid #2e3340; border-radius: 4px;
    width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .btn-editar { color: #5a6072; }
  .btn-editar:hover { background: #1a2a1a; border-color: #3a6040; color: #4caf79; }
  .btn-editar--activo { background: #1c1a10; border-color: #8a5a20; color: #f4a261; }

  .btn-eliminar { color: #5a6072; }
  .btn-eliminar:hover { background: #3d1a1a; border-color: #7a2020; color: #e05252; }
  .btn-eliminar:disabled, .btn-editar:disabled {
    opacity: 0.35; cursor: not-allowed; pointer-events: none;
  }

  /* ── Estados vacío / error ── */
  .admin-estado {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 0.75rem; padding: 3rem 1.5rem;
    color: #3d4455; text-align: center;
  }
  .admin-estado svg { opacity: 0.4; }
  .admin-estado p { font-size: 0.8125rem; line-height: 1.5; }
  .admin-estado strong { color: #e05252; font-weight: 500; }

  /* ── Columna derecha: formulario ── */
  .admin-form-panel {
    padding: clamp(1.5rem, 3vw, 2.5rem); overflow-y: auto; background: #0f1117;
  }
  .admin-form-panel::-webkit-scrollbar { width: 4px; }
  .admin-form-panel::-webkit-scrollbar-track { background: transparent; }
  .admin-form-panel::-webkit-scrollbar-thumb { background: #252830; border-radius: 2px; }

  /* Banner de modo edición */
  .admin-modo-edicion {
    display: flex; align-items: center; gap: 0.625rem;
    background: #1c1a10; border: 1px solid #8a5a20; border-radius: 8px;
    padding: 0.625rem 1rem; margin-bottom: 1.5rem;
    font-size: 0.8rem; color: #f4a261; line-height: 1.4;
  }
  .admin-modo-edicion svg { flex-shrink: 0; }

  .admin-form__eyebrow {
    font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.14em;
    font-weight: 600; margin-bottom: 0.375rem;
    transition: color 0.3s;
  }
  .admin-form__eyebrow--crear { color: #e63946; }
  .admin-form__eyebrow--editar { color: #f4a261; }

  .admin-form__titulo {
    font-family: var(--fuente-titulo, Georgia, serif);
    font-size: clamp(1.375rem, 2.5vw, 1.75rem); font-weight: 700; color: #f0eee8;
    line-height: 1.15; margin-bottom: 0.5rem;
  }
  .admin-form__subtitulo {
    font-size: 0.8125rem; color: #5a6072; margin-bottom: 2rem; line-height: 1.55;
  }

  /* ── Campos ── */
  .campo-grupo { margin-bottom: 1.25rem; }
  .campo-grupo--fila { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 640px) { .campo-grupo--fila { grid-template-columns: 1fr; } }

  .campo-label {
    display: block; font-size: 0.75rem; font-weight: 500; color: #8892a4;
    letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 0.4rem;
  }
  .campo-label span { color: #e63946; margin-left: 2px; }

  .campo-input, .campo-select, .campo-textarea {
    width: 100%; background: #161920; border: 1px solid #252830; border-radius: 6px;
    color: #d8d4cc; font-family: var(--fuente-ui, system-ui, sans-serif);
    font-size: 0.875rem; padding: 0.625rem 0.875rem;
    transition: border-color 0.2s, box-shadow 0.2s; outline: none;
    -webkit-appearance: none; appearance: none;
  }
  .campo-input::placeholder, .campo-textarea::placeholder { color: #3d4455; }
  .campo-input:focus, .campo-select:focus, .campo-textarea:focus {
    border-color: #e63946; box-shadow: 0 0 0 3px rgba(230,57,70,0.12);
  }
  .campo-input.error, .campo-select.error, .campo-textarea.error {
    border-color: #7a2020; box-shadow: 0 0 0 3px rgba(122,32,32,0.15);
  }
  .campo-textarea { resize: vertical; min-height: 80px; line-height: 1.5; }
  .campo-select {
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%235a6072' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 0.875rem center; padding-right: 2.5rem;
  }
  .campo-select option { background: #161920; }
  .campo-error {
    display: flex; align-items: center; gap: 4px; margin-top: 0.3rem;
    font-size: 0.7rem; color: #e05252; letter-spacing: 0.01em;
  }

  /* ── Mapa ── */
  .admin-mapa-seccion { margin-bottom: 1.5rem; }
  .admin-mapa-label {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;
  }
  .admin-mapa-hint { font-size: 0.7rem; color: #5a6072; display: flex; align-items: center; gap: 4px; }
  .admin-mapa-contenedor {
    border-radius: 8px; overflow: hidden; border: 1px solid #252830;
    height: 280px; position: relative; cursor: crosshair; transition: border-color 0.2s;
  }
  .admin-mapa-contenedor.tiene-pin { border-color: #e63946; }
  .admin-mapa-contenedor.tiene-pin-edicion { border-color: #f4a261; }
  .admin-mapa-contenedor.error-borde { border-color: #7a2020; box-shadow: 0 0 0 3px rgba(122,32,32,0.15); }
  .admin-mapa-contenedor .leaflet-container { height: 100%; background: #1a1e27; cursor: crosshair !important; }

  .coords-badge {
    position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
    z-index: 800; background: rgba(15,17,23,0.88); backdrop-filter: blur(8px);
    border: 1px solid #252830; border-radius: 999px; padding: 0.3rem 0.875rem;
    font-size: 0.6875rem; font-family: 'SF Mono', 'Fira Code', monospace;
    color: #8892a4; pointer-events: none; white-space: nowrap; transition: color 0.2s;
  }
  .coords-badge.seleccionado { color: #e63946; border-color: rgba(230,57,70,0.35); }
  .coords-badge.seleccionado-edicion { color: #f4a261; border-color: rgba(244,162,97,0.35); }

  /* ── Divisor ── */
  .admin-divisor { border: none; border-top: 1px solid #1e2128; margin: 1.75rem 0; }

  /* ── Acciones del formulario ── */
  .admin-acciones {
    display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; margin-top: 1.5rem;
  }

  .btn-enviar {
    border: none; border-radius: 6px;
    font-family: var(--fuente-ui, system-ui, sans-serif); font-size: 0.875rem;
    font-weight: 600; padding: 0.7rem 1.75rem; cursor: pointer; letter-spacing: 0.02em;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
    display: flex; align-items: center; gap: 0.5rem; color: #fff;
  }
  .btn-enviar--crear { background: #e63946; }
  .btn-enviar--crear:hover:not(:disabled) {
    background: #c1121f; box-shadow: 0 4px 16px rgba(230,57,70,0.35); transform: translateY(-1px);
  }
  .btn-enviar--editar { background: #c47a2a; }
  .btn-enviar--editar:hover:not(:disabled) {
    background: #a85f15; box-shadow: 0 4px 16px rgba(244,162,97,0.35); transform: translateY(-1px);
  }
  .btn-enviar:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

  .btn-limpiar {
    background: transparent; color: #5a6072; border: 1px solid #252830; border-radius: 6px;
    font-family: var(--fuente-ui, system-ui, sans-serif); font-size: 0.875rem;
    font-weight: 400; padding: 0.7rem 1.25rem; cursor: pointer; transition: background 0.15s, color 0.15s;
  }
  .btn-limpiar:hover { background: #1c2030; color: #d8d4cc; }

  .btn-cancelar-edicion {
    background: transparent; color: #f4a261; border: 1px solid #8a5a20; border-radius: 6px;
    font-family: var(--fuente-ui, system-ui, sans-serif); font-size: 0.875rem;
    font-weight: 500; padding: 0.7rem 1.25rem; cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    display: flex; align-items: center; gap: 0.4rem;
  }
  .btn-cancelar-edicion:hover { background: #1c1a10; color: #fbbf80; border-color: #c07830; }

  /* ── Toast ── */
  .admin-toast {
    position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999;
    background: #161920; border: 1px solid #252830; border-radius: 8px;
    padding: 0.875rem 1.25rem; box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    display: flex; align-items: center; gap: 0.75rem; font-size: 0.8125rem;
    color: #d8d4cc; max-width: 340px; animation: toast-entrar 0.3s ease both;
  }
  .admin-toast--ok    { border-left: 3px solid #4caf79; }
  .admin-toast--error { border-left: 3px solid #e05252; }
  .admin-toast__icono { flex-shrink: 0; font-size: 1.125rem; }
  .admin-toast__msg   { line-height: 1.45; flex: 1; }
  .admin-toast__msg strong { display: block; font-weight: 600; margin-bottom: 1px; }
  .btn-toast-cerrar {
    background: transparent; border: none; color: #3d4455; cursor: pointer;
    flex-shrink: 0; padding: 2px; line-height: 1; transition: color 0.15s;
  }
  .btn-toast-cerrar:hover { color: #8892a4; }

  /* ── Spinner ── */
  .spinner {
    width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2);
    border-top-color: white; border-radius: 50%; animation: girar 0.7s linear infinite; flex-shrink: 0;
  }

  /* ── Contador lista ── */
  .admin-lista__contador {
    font-size: 0.6875rem; color: #3d4455; padding: 0.375rem 1.25rem;
    border-bottom: 1px solid #1e2128; display: flex; align-items: center; justify-content: space-between;
  }
  .admin-lista__contador-num {
    font-size: 0.7rem; font-weight: 600; color: #5a6072;
    background: #1e2128; padding: 1px 7px; border-radius: 999px;
  }

  /* ── Skeleton ── */
  .lista-skeleton { padding: 0.5rem 0; }
  .lista-skeleton__fila {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.875rem 1.25rem; border-bottom: 1px solid #1a1e27;
  }
  .skel { background: #1e2128; border-radius: 4px; animation: pulso 1.6s ease-in-out infinite; }

  /* ── Uploader de imagen ── */
  .imagen-uploader { margin-bottom: 1.5rem; }

  .imagen-dropzone {
    position: relative;
    border: 1.5px dashed #2e3340;
    border-radius: 8px;
    background: #161920;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    overflow: hidden;
  }
  .imagen-dropzone:hover,
  .imagen-dropzone:focus-within { border-color: #e63946; background: #1a1520; }
  .imagen-dropzone.tiene-preview { border-style: solid; border-color: #2e3340; }
  .imagen-dropzone.arrastrando   { border-color: #e63946; background: #1a1520;
                                    box-shadow: 0 0 0 3px rgba(230,57,70,0.15); }
  .imagen-dropzone.error-borde   { border-color: #7a2020;
                                    box-shadow: 0 0 0 3px rgba(122,32,32,0.15); }

  /* Input nativo oculto — activado por clic en la zona */
  .imagen-dropzone__input {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; z-index: 2;
    width: 100%; height: 100%;
  }

  /* Estado vacío: icono + texto */
  .imagen-dropzone__placeholder {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 0.625rem; padding: 2rem 1.5rem;
    pointer-events: none; /* el input encima captura el clic */
  }
  .imagen-dropzone__icono {
    width: 40px; height: 40px; border-radius: 10px;
    background: #1e2128; display: flex; align-items: center; justify-content: center;
    color: #3d4455; transition: color 0.2s, background 0.2s;
  }
  .imagen-dropzone:hover .imagen-dropzone__icono { color: #e63946; background: #2a1520; }
  .imagen-dropzone__texto {
    font-size: 0.8rem; color: #5a6072; text-align: center; line-height: 1.5;
  }
  .imagen-dropzone__texto strong { color: #8892a4; font-weight: 500; display: block; }
  .imagen-dropzone__tipos {
    font-size: 0.7rem; color: #3d4455; margin-top: 0.25rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  /* Estado con preview */
  .imagen-preview {
    position: relative; display: block; width: 100%; aspect-ratio: 16/7;
  }
  .imagen-preview__img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    transition: opacity 0.2s;
  }
  .imagen-dropzone:hover .imagen-preview__img { opacity: 0.75; }

  /* Overlay sobre el preview */
  .imagen-preview__overlay {
    position: absolute; inset: 0; z-index: 3;
    display: flex; align-items: center; justify-content: center; gap: 0.75rem;
    opacity: 0; transition: opacity 0.2s; background: rgba(15,17,23,0.6);
    pointer-events: none;
  }
  .imagen-dropzone:hover .imagen-preview__overlay { opacity: 1; }

  .imagen-preview__btn {
    background: rgba(15,17,23,0.85); border: 1px solid #3d4455;
    color: #d8d4cc; border-radius: 6px; font-size: 0.75rem; font-weight: 500;
    padding: 0.4rem 0.875rem; cursor: pointer; pointer-events: all;
    display: flex; align-items: center; gap: 5px;
    transition: background 0.15s, border-color 0.15s;
    font-family: var(--fuente-ui, system-ui);
  }
  .imagen-preview__btn:hover { background: #1e2128; border-color: #5a6072; }
  .imagen-preview__btn--quitar { color: #e05252; border-color: #7a2020; }
  .imagen-preview__btn--quitar:hover { background: #3d1a1a; border-color: #e05252; }

  /* Badges bajo el dropzone */
  .imagen-meta {
    display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;
  }
  .imagen-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 0.6875rem; padding: 2px 8px; border-radius: 999px; font-weight: 500;
  }
  .imagen-badge--nuevo  { background: rgba(76,175,121,0.12); color: #4caf79; border: 1px solid rgba(76,175,121,0.2); }
  .imagen-badge--actual { background: rgba(90,96,114,0.15); color: #8892a4; border: 1px solid #2e3340; }
  .imagen-badge--webp   { background: rgba(230,57,70,0.1); color: #e63946; border: 1px solid rgba(230,57,70,0.2); }

  /* Barra de progreso de subida */
  .upload-progress {
    margin-top: 0.625rem; border-radius: 4px; overflow: hidden;
    background: #1e2128; height: 4px;
  }
  .upload-progress__barra {
    height: 100%; background: linear-gradient(90deg, #e63946, #f4a261);
    border-radius: 4px; transition: width 0.3s ease;
  }
  .upload-progress__texto {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 0.6875rem; color: #5a6072; margin-top: 0.25rem;
  }

  /* ── Keyframes ── */
  @keyframes girar  { to { transform: rotate(360deg); } }
  @keyframes pulso  { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes toast-entrar {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`

// ── Hook: carga y gestión de la lista ────────────────────────────────────────
function useListaAtractivos() {
  const [atractivos, setAtractivos] = useState([])
  const [cargando, setCargando]     = useState(true)
  const [error, setError]           = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try {
      const { data } = await atractivosService.getAll({ por_pagina: 100 })
      setAtractivos(data?.items ?? data ?? [])
    } catch (e) {
      setError(e.response?.data?.detail ?? 'No se pudo cargar la lista.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  return { atractivos, cargando, error, recargar: cargar, setAtractivos }
}

// ── Subcomponente: Toast ──────────────────────────────────────────────────────
function Toast({ toast, onCerrar }) {
  if (!toast) return null
  return (
    <div className={`admin-toast admin-toast--${toast.tipo}`} role="alert" aria-live="assertive">
      <span className="admin-toast__icono">{toast.tipo === 'ok' ? '✅' : '❌'}</span>
      <div className="admin-toast__msg">
        <strong>{toast.titulo}</strong>
        {toast.mensaje}
      </div>
      <button className="btn-toast-cerrar" onClick={onCerrar} aria-label="Cerrar notificación">
        <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 1l12 12M13 1L1 13"/>
        </svg>
      </button>
    </div>
  )
}

// ── Subcomponente: fila de atractivo con botones Editar y Eliminar ────────────
function AtractivoFila({ atractivo, onEditar, onEliminar, eliminando, idEditando }) {
  const cat     = CATEGORIAS.find(c => c.nombre === atractivo.categoria?.nombre)
                  ?? CATEGORIAS.find(c => c.id === atractivo.categoria_id)
  const editando = idEditando === atractivo.id
  const ocupado  = eliminando === atractivo.id

  return (
    <div className={`atractivo-fila${editando ? ' atractivo-fila--editando' : ''}`}>
      <span
        className="atractivo-fila__dot"
        style={{ background: cat?.color ?? '#5a6072' }}
        aria-hidden="true"
      />
      <div className="atractivo-fila__info">
        <p className="atractivo-fila__nombre" title={atractivo.nombre}>
          {atractivo.nombre}
        </p>
        <div className="atractivo-fila__meta">
          {cat && <span className="atractivo-fila__cat">{cat.nombre}</span>}
          {atractivo.municipio && (
            <span className="atractivo-fila__municipio">· {atractivo.municipio}</span>
          )}
        </div>
      </div>

      <div className="fila-acciones">
        {/* ── Botón Editar ── */}
        <button
          className={`btn-editar${editando ? ' btn-editar--activo' : ''}`}
          onClick={() => onEditar(atractivo)}
          disabled={ocupado}
          aria-label={`Editar ${atractivo.nombre}`}
          aria-pressed={editando}
          title={editando ? 'Editando ahora' : 'Editar atractivo'}
        >
          {/* Ícono lápiz SVG */}
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5z"/>
          </svg>
        </button>

        {/* ── Botón Eliminar ── */}
        <button
          className="btn-eliminar"
          onClick={() => onEliminar(atractivo.id, atractivo.nombre)}
          disabled={ocupado || editando}
          aria-label={`Eliminar ${atractivo.nombre}`}
          title={editando ? 'Cancela la edición antes de eliminar' : 'Desactivar (soft-delete)'}
        >
          {ocupado ? (
            <div className="spinner" style={{ width: 12, height: 12 }} />
          ) : (
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Subcomponente: skeleton de lista ──────────────────────────────────────────
function ListaSkeleton() {
  return (
    <div className="lista-skeleton" aria-busy="true">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="lista-skeleton__fila">
          <div className="skel" style={{ width: 8, height: 8, borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skel" style={{ height: 11, width: `${55 + (i * 7) % 35}%` }} />
            <div className="skel" style={{ height: 9, width: '38%' }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <div className="skel" style={{ width: 28, height: 28, borderRadius: 4 }} />
            <div className="skel" style={{ width: 28, height: 28, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function AdminPanel() {
  // ── Lista
  const { atractivos, cargando, error: errorLista, recargar, setAtractivos } = useListaAtractivos()
  const [eliminando, setEliminando] = useState(null)

  // ── Edición: id del atractivo que se está editando (null = modo creación)
  const [idEditando, setIdEditando] = useState(null)

  // ── Formulario
  const [form, setForm]           = useState(FORM_INICIAL)
  const [erroresForm, setErrores] = useState({})
  const [enviando, setEnviando]   = useState(false)

  // ── Imagen: archivo seleccionado, URL de preview y progreso de subida
  const [archivoImagen, setArchivoImagen]   = useState(null)   // File | null
  const [previewUrl, setPreviewUrl]         = useState(null)   // object URL | null
  const [uploadProgress, setUploadProgress] = useState(null)   // 0-100 | null
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const inputImagenRef = useRef(null)

  // ── Toast
  const [toast, setToast]   = useState(null)
  const toastTimer          = useRef(null)

  // ── Ref de scroll para llevar la vista al formulario al editar en mobile
  const formRef = useRef(null)

  // ── Inyectar CSS al montar ────────────────────────────────────────────────
  useEffect(() => {
    const tag = document.createElement('style')
    tag.id = 'admin-panel-css'
    tag.textContent = CSS_ADMIN
    if (!document.getElementById('admin-panel-css')) document.head.appendChild(tag)
    return () => document.getElementById('admin-panel-css')?.remove()
  }, [])

  // ── Toast helper ──────────────────────────────────────────────────────────
  const mostrarToast = useCallback((tipo, titulo, mensaje) => {
    clearTimeout(toastTimer.current)
    setToast({ tipo, titulo, mensaje })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  // ── Resetear formulario + modo edición ────────────────────────────────────
  const resetearFormulario = useCallback(() => {
    setForm(FORM_INICIAL)
    setErrores({})
    setIdEditando(null)
    // Liberar la object URL para evitar memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setArchivoImagen(null)
    setPreviewUrl(null)
    setUploadProgress(null)
    if (inputImagenRef.current) inputImagenRef.current.value = ''
  }, [previewUrl])

  // ── Iniciar edición: llenar form con datos del atractivo ──────────────────
  const handleEditar = useCallback((atractivo) => {
    // Si hacemos clic en el que ya está editando, cancelamos
    if (idEditando === atractivo.id) {
      resetearFormulario()
      return
    }

    // Limpiar imagen anterior al cambiar de atractivo
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setArchivoImagen(null)
    setPreviewUrl(null)
    setUploadProgress(null)
    if (inputImagenRef.current) inputImagenRef.current.value = ''

    // Parsear coordenadas desde geom_wkt
    const coords = parsearGeomWkt(atractivo.geom_wkt)

    setForm({
      nombre:            atractivo.nombre ?? '',
      descripcion_corta: atractivo.descripcion_corta ?? '',
      categoria_id:      atractivo.categoria_id
                          ?? atractivo.categoria?.id
                          ?? '',
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
    })
    setErrores({})
    setIdEditando(atractivo.id)

    // Scroll suave al formulario en pantallas pequeñas
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }, [idEditando, previewUrl, resetearFormulario])

  // ── Eliminar (soft-delete) ────────────────────────────────────────────────
  const handleEliminar = useCallback(async (id, nombre) => {
    if (!window.confirm(`¿Desactivar "${nombre}"?\nEl registro permanece en la base de datos.`)) return
    setEliminando(id)
    try {
      await atractivosService.remove(id)
      setAtractivos(prev => prev.filter(a => a.id !== id))
      mostrarToast('ok', 'Atractivo desactivado', `"${nombre}" fue marcado como inactivo.`)
    } catch (e) {
      mostrarToast('error', 'Error al eliminar', e.response?.data?.detail ?? 'Intenta de nuevo.')
    } finally {
      setEliminando(null)
    }
  }, [setAtractivos, mostrarToast])

  // ── Manejador de campo genérico ───────────────────────────────────────────
  const handleCampo = (campo) => (e) => {
    setForm(prev => ({ ...prev, [campo]: e.target.value }))
    if (erroresForm[campo]) setErrores(prev => ({ ...prev, [campo]: null }))
  }

  // ── Selección de imagen (input file o drag & drop) ────────────────────────
  const handleArchivoImagen = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo en el cliente como primera línea de defensa
    // (el servidor también valida, pero esto da feedback instantáneo)
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!tiposPermitidos.includes(file.type)) {
      setErrores(prev => ({
        ...prev,
        imagen: `Tipo no permitido: ${file.type}. Usa JPG, PNG o WebP.`,
      }))
      return
    }

    // Tamaño máximo orientativo en el cliente: 15 MB
    if (file.size > 15 * 1024 * 1024) {
      setErrores(prev => ({
        ...prev,
        imagen: 'La imagen supera los 15 MB. Elige una más pequeña.',
      }))
      return
    }

    // Limpiar error y preview anterior
    setErrores(prev => ({ ...prev, imagen: null }))
    if (previewUrl) URL.revokeObjectURL(previewUrl)

    // createObjectURL: genera una URL temporal en memoria — sin subida a servidor.
    // Se libera al resetear el formulario o cambiar de archivo.
    setPreviewUrl(URL.createObjectURL(file))
    setArchivoImagen(file)
    setUploadProgress(null)
  }, [previewUrl])

  // ── Quitar la imagen seleccionada (sin tocar la del servidor) ────────────
  const handleQuitarImagen = useCallback((e) => {
    e.stopPropagation() // evita que el clic abra el input de archivo
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setArchivoImagen(null)
    setPreviewUrl(null)
    setUploadProgress(null)
    if (inputImagenRef.current) inputImagenRef.current.value = ''
  }, [previewUrl])

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const [arrastrando, setArrastrando] = useState(false)

  const handleDragOver = (e) => { e.preventDefault(); setArrastrando(true) }
  const handleDragLeave = ()  => setArrastrando(false)
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setArrastrando(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleArchivoImagen({ target: { files: [file] } })
  }, [handleArchivoImagen])

  // ── Clic en el mapa → guardar coordenadas ────────────────────────────────
  const handleMapaClic = useCallback((lat, lon) => {
    setForm(prev => ({ ...prev, lat, lon }))
    if (erroresForm.coords) setErrores(prev => ({ ...prev, coords: null }))
  }, [erroresForm.coords])

  // ── Validación ────────────────────────────────────────────────────────────
  const validar = () => {
    const e = {}
    if (!form.nombre.trim())           e.nombre       = 'El nombre es obligatorio.'
    if (form.nombre.trim().length < 3) e.nombre       = 'Mínimo 3 caracteres.'
    if (!form.categoria_id)            e.categoria_id = 'Selecciona una categoría.'
    if (!form.lat || !form.lon)        e.coords       = 'Haz clic en el mapa para fijar la ubicación.'
    return e
  }

  // ── Enviar formulario: bifurca entre create() y update(), luego sube imagen ─
  const handleSubmit = async (e) => {
    e.preventDefault()
    const errores = validar()
    if (Object.keys(errores).length) { setErrores(errores); return }

    setEnviando(true)
    const modoEdicion = !!idEditando

    try {
      const payload = {
        nombre:            form.nombre.trim(),
        descripcion_corta: form.descripcion_corta.trim() || null,
        categoria_id:      Number(form.categoria_id),
        tipo_geom:         'POINT',
        municipio:         'Nilo',
        departamento:      'Cundinamarca',
        geom: {
          type:        'Point',
          coordinates: [form.lon, form.lat, 0],
        },
      }

      let atractivoData
      if (modoEdicion) {
        const { data } = await atractivosService.update(idEditando, payload)
        atractivoData = data
        setAtractivos(prev =>
          prev.map(a => a.id === idEditando ? { ...a, ...data } : a)
        )
      } else {
        const { data } = await atractivosService.create(payload)
        atractivoData = data
        setAtractivos(prev => [data, ...prev])
      }

      // ── Subida de imagen (si hay archivo seleccionado) ──────────────────
      // Se ejecuta SIEMPRE después de create o update, usando el id definitivo.
      // Si falla, el atractivo ya fue guardado — notificamos error parcial.
      if (archivoImagen) {
        setSubiendoImagen(true)
        setUploadProgress(0)
        try {
          const { data: imgData } = await atractivosService.uploadImage(
            atractivoData.id,
            archivoImagen,
            (pct) => setUploadProgress(pct),
          )
          // Actualizar imagen_principal en la lista local
          setAtractivos(prev =>
            prev.map(a =>
              a.id === atractivoData.id
                ? { ...a, imagen_principal: imgData.imagen_principal }
                : a
            )
          )
          mostrarToast(
            'ok',
            modoEdicion ? 'Cambios guardados con imagen' : 'Atractivo creado con imagen',
            `"${atractivoData.nombre}" — imagen optimizada a WebP y guardada.`,
          )
        } catch (imgErr) {
          // El dato fue guardado, solo falló la imagen — tono de advertencia
          mostrarToast(
            'error',
            `${modoEdicion ? 'Cambios guardados' : 'Atractivo creado'} — error en imagen`,
            imgErr.response?.data?.detail ?? 'No se pudo subir la imagen. Inténtalo de nuevo.',
          )
        } finally {
          setSubiendoImagen(false)
          setUploadProgress(null)
        }
      } else {
        // Sin imagen nueva: toast simple de éxito
        mostrarToast(
          'ok',
          modoEdicion ? 'Cambios guardados' : 'Atractivo creado',
          `"${atractivoData.nombre}" fue ${modoEdicion ? 'actualizado' : 'registrado'} correctamente.`,
        )
      }

      resetearFormulario()
    } catch (err) {
      const detalle = err.response?.data?.detail
        ?? `No se pudo ${modoEdicion ? 'actualizar' : 'crear'} el atractivo.`
      mostrarToast('error', modoEdicion ? 'Error al actualizar' : 'Error al crear', detalle)
    } finally {
      setEnviando(false)
    }
  }

  // ── Valores derivados para el render ──────────────────────────────────────
  const modoEdicion    = !!idEditando
  const nombreEditando = modoEdicion ? atractivos.find(a => a.id === idEditando)?.nombre : null
  const atractivoEditando = modoEdicion ? atractivos.find(a => a.id === idEditando) : null

  // URL de preview: archivo nuevo > imagen existente del atractivo en edición
  const urlPreviewEfectiva = previewUrl
    ?? (modoEdicion && atractivoEditando?.imagen_principal
        // La imagen del servidor es una ruta relativa — la completamos con la base del backend
        ? `http://127.0.0.1:8000${atractivoEditando.imagen_principal}`
        : null)

  // Texto del botón submit según el estado de la operación
  const textoBotonSubmit = (() => {
    if (subiendoImagen) return 'Subiendo imagen…'
    if (enviando) return modoEdicion ? 'Guardando cambios…' : 'Registrando…'
    return modoEdicion ? 'Guardar Cambios' : 'Registrar Atractivo'
  })()

  const ocupadoTotal = enviando || subiendoImagen

  // Destino para el VoladorMapa: solo vuela cuando hay coordenadas de edición
  const destinoVuelo = (modoEdicion && form.lat && form.lon)
    ? { lat: form.lat, lon: form.lon }
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="admin-panel">

        {/* ═══ COLUMNA IZQUIERDA — Lista ═══════════════════════════════════ */}
        <aside className="admin-lista" aria-label="Lista de atractivos registrados">
          <div className="admin-lista__header">
            <h2 className="admin-lista__titulo">Atractivos Registrados</h2>
            <p className="admin-lista__subtitulo">
              {modoEdicion
                ? `✏️ Editando: ${nombreEditando ?? '…'}`
                : 'Gestión · Editar o desactivar registros'}
            </p>
          </div>

          {!cargando && !errorLista && (
            <div className="admin-lista__contador" aria-live="polite">
              <span>Total en esta página</span>
              <span className="admin-lista__contador-num">{atractivos.length}</span>
            </div>
          )}

          <div className="admin-lista__body">
            {cargando && <ListaSkeleton />}

            {!cargando && errorLista && (
              <div className="admin-estado">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p><strong>{errorLista}</strong></p>
                <button className="btn-limpiar" onClick={recargar} style={{ marginTop: 4 }}>Reintentar</button>
              </div>
            )}

            {!cargando && !errorLista && atractivos.length === 0 && (
              <div className="admin-estado">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M9 9h6M9 13h4"/>
                </svg>
                <p>No hay atractivos registrados.<br/>Crea el primero con el formulario.</p>
              </div>
            )}

            {!cargando && !errorLista && atractivos.map(a => (
              <AtractivoFila
                key={a.id}
                atractivo={a}
                onEditar={handleEditar}
                onEliminar={handleEliminar}
                eliminando={eliminando}
                idEditando={idEditando}
              />
            ))}
          </div>
        </aside>

        {/* ═══ COLUMNA DERECHA — Formulario ════════════════════════════════ */}
        <section
          ref={formRef}
          className="admin-form-panel"
          aria-label={modoEdicion ? 'Formulario de edición de atractivo' : 'Formulario de creación de atractivo'}
        >
          {/* Banner de modo edición */}
          {modoEdicion && (
            <div className="admin-modo-edicion" role="status">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M14.5 3.5a2 2 0 0 1 2.83 2.83L6 17.66l-4 1 1-4L14.5 3.5z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>
                Modo edición activo —{' '}
                <strong style={{ color: '#fbbf80' }}>{nombreEditando}</strong>.
                Los cambios reemplazarán los valores actuales.
              </span>
            </div>
          )}

          {/* Cabecera dinámica */}
          <p className={`admin-form__eyebrow admin-form__eyebrow--${modoEdicion ? 'editar' : 'crear'}`}>
            {modoEdicion ? 'Backoffice · Editar registro' : 'Backoffice · Nilo Destino Mágico'}
          </p>
          <h2 className="admin-form__titulo">
            {modoEdicion ? (
              <>Editar Atractivo<br/>Turístico</>
            ) : (
              <>Registrar Atractivo<br/>Turístico</>
            )}
          </h2>
          <p className="admin-form__subtitulo">
            {modoEdicion
              ? 'Modifica los campos que necesites y haz clic en el mapa para reubicar el pin si es necesario.'
              : 'Completa el formulario y haz clic en el mapa para fijar la ubicación exacta. La geometría se enviará en formato GeoJSON 3D compatible con PostGIS.'}
          </p>

          <form onSubmit={handleSubmit} noValidate>

            {/* ── Nombre ── */}
            <div className="campo-grupo">
              <label className="campo-label" htmlFor="ap-nombre">
                Nombre del Atractivo <span aria-hidden="true">*</span>
              </label>
              <input
                id="ap-nombre"
                type="text"
                className={`campo-input${erroresForm.nombre ? ' error' : ''}`}
                placeholder="Ej: Hacienda Calandaima"
                value={form.nombre}
                onChange={handleCampo('nombre')}
                maxLength={255}
                autoComplete="off"
              />
              {erroresForm.nombre && (
                <p className="campo-error" role="alert">
                  <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor">
                    <circle cx="6" cy="6" r="6" opacity=".15"/>
                    <path d="M6 3.5v3M6 8h.01" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                  </svg>
                  {erroresForm.nombre}
                </p>
              )}
            </div>

            {/* ── Descripción corta ── */}
            <div className="campo-grupo">
              <label className="campo-label" htmlFor="ap-desc">Descripción Corta</label>
              <textarea
                id="ap-desc"
                className="campo-textarea"
                placeholder="Breve descripción del atractivo (máx. 500 caracteres)"
                value={form.descripcion_corta}
                onChange={handleCampo('descripcion_corta')}
                maxLength={500}
                rows={3}
              />
            </div>

            {/* ── Categoría ── */}
            <div className="campo-grupo">
              <label className="campo-label" htmlFor="ap-cat">
                Categoría <span aria-hidden="true">*</span>
              </label>
              <select
                id="ap-cat"
                className={`campo-select${erroresForm.categoria_id ? ' error' : ''}`}
                value={form.categoria_id}
                onChange={handleCampo('categoria_id')}
              >
                <option value="">— Selecciona una categoría —</option>
                {CATEGORIAS.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              {erroresForm.categoria_id && (
                <p className="campo-error" role="alert">{erroresForm.categoria_id}</p>
              )}
            </div>

            <hr className="admin-divisor" />

            {/* ── Mapa de selección ── */}
            <div className="admin-mapa-seccion">
              <div className="admin-mapa-label">
                <label className="campo-label" style={{ margin: 0 }}>
                  Ubicación en el Mapa <span aria-hidden="true" style={{ color: '#e63946' }}>*</span>
                </label>
                <span className="admin-mapa-hint">
                  <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="7" cy="7" r="6"/>
                    <path d="M7 5v4M7 3.5h.01" strokeLinecap="round"/>
                  </svg>
                  {modoEdicion ? 'Clic para reubicar el pin' : 'Clic en el mapa para fijar'}
                </span>
              </div>

              <div
                className={[
                  'admin-mapa-contenedor',
                  form.lat ? (modoEdicion ? 'tiene-pin-edicion' : 'tiene-pin') : '',
                  erroresForm.coords ? 'error-borde' : '',
                ].filter(Boolean).join(' ')}
                aria-label="Mapa para seleccionar ubicación. Haz clic para fijar un marcador."
              >
                <MapContainer
                  center={[NILO.lat, NILO.lon]}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={true}
                  attributionControl={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                  />
                  {/* NUEVO: El parche que arregla el mapa gris */}
                  <FixMapSize />
                  {/* Captura clics → actualiza form.lat / form.lon */}
                  <CapturadorClics onClic={handleMapaClic} />

                  {/*
                    VoladorMapa: anima el mapa al pin cuando se carga un atractivo
                    para editar. Solo actúa cuando `destinoVuelo` cambia.
                  */}
                  <VoladorMapa destino={destinoVuelo} />

                  {/* Marcador del pin actual */}
                  {form.lat && form.lon && (
                    <Marker
                      position={[form.lat, form.lon]}
                      icon={modoEdicion ? ICONO_PIN_EDICION : ICONO_PIN}
                    >
                      <Popup>
                        <strong style={{ fontSize: '0.8rem', color: modoEdicion ? '#f4a261' : '#e63946' }}>
                          {modoEdicion ? 'Nueva ubicación' : 'Ubicación seleccionada'}
                        </strong>
                        <br />
                        <code style={{ fontSize: '0.7rem', color: '#5a6072' }}>
                          {form.lat.toFixed(6)}, {form.lon.toFixed(6)}
                        </code>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>

                {/* Badge de coordenadas flotante */}
                <div className={`coords-badge${form.lat ? (modoEdicion ? ' seleccionado-edicion' : ' seleccionado') : ''}`}>
                  {form.lat && form.lon
                    ? `📍 ${form.lat.toFixed(5)}, ${form.lon.toFixed(5)}`
                    : 'Sin ubicación — haz clic en el mapa'}
                </div>
              </div>

              {erroresForm.coords && (
                <p className="campo-error" role="alert" style={{ marginTop: '0.4rem' }}>
                  {erroresForm.coords}
                </p>
              )}

              {/* Campos de solo lectura para confirmación */}
              {form.lat && form.lon && (
                <div className="campo-grupo--fila" style={{ marginTop: '0.75rem' }}>
                  <div>
                    <label className="campo-label">Latitud (auto)</label>
                    <input type="text" className="campo-input" value={form.lat.toFixed(6)}
                      readOnly aria-readonly="true"
                      style={{ color: modoEdicion ? '#f4a261' : '#e63946', cursor: 'default' }} />
                  </div>
                  <div>
                    <label className="campo-label">Longitud (auto)</label>
                    <input type="text" className="campo-input" value={form.lon.toFixed(6)}
                      readOnly aria-readonly="true"
                      style={{ color: modoEdicion ? '#f4a261' : '#e63946', cursor: 'default' }} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Uploader de imagen principal ── */}
            <div className="imagen-uploader">
              <div className="admin-mapa-label" style={{ marginBottom: '0.5rem' }}>
                <label className="campo-label" style={{ margin: 0 }}>
                  Imagen Principal
                  <span style={{ color: '#3d4455', fontWeight: 400, textTransform: 'none',
                                 letterSpacing: 0, marginLeft: 6 }}>
                    (opcional · se optimiza a WebP)
                  </span>
                </label>
                {urlPreviewEfectiva && !archivoImagen && (
                  <span className="imagen-badge imagen-badge--actual">
                    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="6" cy="6" r="5"/>
                      <path d="M4 6l1.5 1.5L8 4"/>
                    </svg>
                    Imagen actual del servidor
                  </span>
                )}
              </div>

              {/* Zona de drop / input */}
              <div
                className={[
                  'imagen-dropzone',
                  urlPreviewEfectiva ? 'tiene-preview' : '',
                  arrastrando ? 'arrastrando' : '',
                  erroresForm.imagen ? 'error-borde' : '',
                ].filter(Boolean).join(' ')}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                aria-label="Zona para subir imagen. Haz clic o arrastra un archivo."
                onKeyDown={(e) => e.key === 'Enter' && inputImagenRef.current?.click()}
              >
                {/* Input nativo oculto */}
                <input
                  ref={inputImagenRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="imagen-dropzone__input"
                  onChange={handleArchivoImagen}
                  aria-hidden="true"
                  tabIndex={-1}
                />

                {urlPreviewEfectiva ? (
                  /* ── Estado con preview ── */
                  <div className="imagen-preview">
                    <img
                      src={urlPreviewEfectiva}
                      alt="Preview de la imagen del atractivo"
                      className="imagen-preview__img"
                    />
                    <div className="imagen-preview__overlay" aria-hidden="true">
                      <button
                        type="button"
                        className="imagen-preview__btn"
                        onClick={(e) => { e.stopPropagation(); inputImagenRef.current?.click() }}
                      >
                        <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M7 1v6M4 4l3-3 3 3" strokeLinecap="round"/>
                          <path d="M1 10v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" strokeLinecap="round"/>
                        </svg>
                        Cambiar imagen
                      </button>
                      {archivoImagen && (
                        <button
                          type="button"
                          className="imagen-preview__btn imagen-preview__btn--quitar"
                          onClick={handleQuitarImagen}
                        >
                          <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75">
                            <path d="M1 1l12 12M13 1L1 13"/>
                          </svg>
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── Estado vacío ── */
                  <div className="imagen-dropzone__placeholder">
                    <div className="imagen-dropzone__icono">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="3"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                      </svg>
                    </div>
                    <div className="imagen-dropzone__texto">
                      <strong>Haz clic o arrastra una imagen aquí</strong>
                      El servidor la redimensionará a máx. 1080 px y la convertirá a WebP·85
                    </div>
                    <span className="imagen-dropzone__tipos">JPG · PNG · WebP · GIF · máx. 15 MB</span>
                  </div>
                )}
              </div>

              {/* Error de validación de imagen */}
              {erroresForm.imagen && (
                <p className="campo-error" role="alert" style={{ marginTop: '0.35rem' }}>
                  {erroresForm.imagen}
                </p>
              )}

              {/* Badges de metadata del archivo */}
              {archivoImagen && (
                <div className="imagen-meta">
                  <span className="imagen-badge imagen-badge--nuevo">
                    ✦ Nuevo archivo seleccionado
                  </span>
                  <span className="imagen-badge imagen-badge--actual">
                    {archivoImagen.name}
                  </span>
                  <span className="imagen-badge imagen-badge--actual">
                    {(archivoImagen.size / 1024).toFixed(0)} KB
                  </span>
                  <span className="imagen-badge imagen-badge--webp">
                    → .webp
                  </span>
                </div>
              )}

              {/* Barra de progreso de subida */}
              {subiendoImagen && uploadProgress !== null && (
                <div style={{ marginTop: '0.625rem' }}>
                  <div className="upload-progress">
                    <div
                      className="upload-progress__barra"
                      style={{ width: `${uploadProgress}%` }}
                      role="progressbar"
                      aria-valuenow={uploadProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  <div className="upload-progress__texto">
                    <span>Subiendo y optimizando imagen…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Preview del payload JSON ── */}
            {form.lat && form.lon && (
              <details style={{ marginBottom: '1.25rem' }}>
                <summary style={{
                  cursor: 'pointer', fontSize: '0.7rem', color: '#3d4455',
                  userSelect: 'none', letterSpacing: '0.05em', textTransform: 'uppercase',
                }}>
                  {modoEdicion ? 'Ver payload PATCH que se enviará →' : 'Ver payload POST que se enviará →'}
                </summary>
                <pre style={{
                  marginTop: '0.5rem', padding: '0.75rem', background: '#0a0c11',
                  borderRadius: '6px', border: '1px solid #1e2128', fontSize: '0.7rem',
                  color: modoEdicion ? '#f4a261' : '#4caf79', overflowX: 'auto', lineHeight: 1.6,
                }}>
{JSON.stringify({
  ...(modoEdicion ? { id: idEditando } : {}),
  nombre: form.nombre || '…',
  descripcion_corta: form.descripcion_corta || null,
  categoria_id: Number(form.categoria_id) || '…',
  tipo_geom: 'POINT',
  municipio: 'Nilo',
  departamento: 'Cundinamarca',
  geom: { type: 'Point', coordinates: [form.lon, form.lat, 0] },
}, null, 2)}
                </pre>
              </details>
            )}

            {/* ── Botones de acción ── */}
            <div className="admin-acciones">
              {/* Submit dinámico */}
              <button
                type="submit"
                className={`btn-enviar btn-enviar--${modoEdicion ? 'editar' : 'crear'}`}
                disabled={ocupadoTotal}
                aria-busy={ocupadoTotal}
              >
                {ocupadoTotal && <span className="spinner" aria-hidden="true" />}
                {textoBotonSubmit}
              </button>

              {/* Cancelar edición — solo visible en modo edición */}
              {modoEdicion ? (
                <button
                  type="button"
                  className="btn-cancelar-edicion"
                  onClick={resetearFormulario}
                  disabled={ocupadoTotal}
                  aria-label="Cancelar edición y volver al modo creación"
                >
                  <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M1 1l12 12M13 1L1 13"/>
                  </svg>
                  Cancelar Edición
                </button>
              ) : (
                /* Limpiar — solo visible en modo creación */
                <button
                  type="button"
                  className="btn-limpiar"
                  onClick={resetearFormulario}
                  disabled={ocupadoTotal}
                >
                  Limpiar
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      {/* ── Toast global ── */}
      <Toast toast={toast} onCerrar={() => setToast(null)} />
    </>
  )
}