/**
 * src/services/api.js
 * ────────────────────
 * Cliente HTTP centralizado con Axios.
 *
 * Toda la configuración de URLs y timeouts se lee desde variables de entorno
 * de Vite (import.meta.env.VITE_*) definidas en el archivo .env de la raíz.
 *
 * Regla de Vite: solo las variables con prefijo VITE_ son accesibles en
 * el navegador. Las demás son privadas (solo disponibles en vite.config.js).
 *
 * Jerarquía de entornos (Vite las fusiona en este orden):
 *   .env                  ← base (siempre cargado)
 *   .env.local            ← overrides personales (en .gitignore)
 *   .env.[modo]           ← .env.development | .env.production
 *   .env.[modo].local     ← overrides de modo personales
 */

import axios from 'axios'

// ── Configuración desde variables de entorno ──────────────────────────────────
//
// ?? operador: usa el valor de import.meta.env si está definido y no es
// undefined/null. El fallback es el valor por defecto para desarrollo local.
//
// import.meta.env.DEV  → true en `vite dev`, false en `vite build`
// import.meta.env.PROD → true en `vite build`, false en `vite dev`
// import.meta.env.MODE → "development" | "production" | custom
//
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1'

// La URL de health está un nivel arriba de /api/v1 → la derivamos de la base
// Ej: "http://127.0.0.1:8000/api/v1" → "http://127.0.0.1:8000/api/health"
const API_HEALTH_URL = API_BASE_URL.replace(/\/api\/v\d+.*$/, '/api/health')

// ── Instancia base ─────────────────────────────────────────────────────────────
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// ── Interceptor de REQUEST ─────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    // 👇 1. BUSCAMOS EL PASE VIP Y LO INYECTAMOS
    const token = localStorage.getItem('token_nilo')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    if (import.meta.env.DEV) {
      console.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.params ?? '')
    }
    return config
  },
  (error) => Promise.reject(error),
)
// ── Interceptor de RESPONSE ───────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.debug(`[API] ✅ ${response.status} ${response.config.url}`)
    }
    return response
  },
  (error) => {
    const status = error.response?.status
    const url    = error.config?.url

   if (status === 401) {
      console.warn('[API] 401 — sesión expirada o token inválido')
      // 👇 2. EXPULSAMOS AL INTRUSO
      localStorage.removeItem('token_nilo')
      localStorage.removeItem('usuario_nilo')
      window.location.href = '/?login=true'
    } else if (status === 404) {
      console.warn(`[API] 404 — recurso no encontrado: ${url}`)
    } else if (status >= 500) {
      console.error(`[API] 💥 Error del servidor (${status}): ${url}`)
    } else if (!error.response) {
      console.error('[API] 🌐 Sin conexión con el servidor')
    }

    return Promise.reject(error)
  },
)

// ── Servicios de Atractivos Turísticos ────────────────────────────────────────
export const atractivosService = {
  /**
   * Devuelve atractivos dentro de un radio (metros) alrededor de un punto.
   * Las coordenadas por defecto se leen del .env para centralizar la config.
   */
  getCercanos: (
    lon    = Number(import.meta.env.VITE_MAP_CENTER_LON ?? -74.634),
    lat    = Number(import.meta.env.VITE_MAP_CENTER_LAT ?? 4.305),
    radioM = Number(import.meta.env.VITE_MAP_DEFAULT_RADIO_M ?? 5000),
  ) =>
    apiClient.get('/atractivos/cercanos', {
      params: { lon, lat, radio_m: radioM },
    }),

  /** Listado paginado con filtros opcionales */
  getAll: (params = {}) => apiClient.get('/atractivos', { params }),

  /** Detalle de un atractivo por UUID */
  getById: (id) => apiClient.get(`/atractivos/${id}`),

  /** Crear nuevo atractivo */
  create: (data) => apiClient.post('/atractivos', data),

  /** Actualizar campos de un atractivo (PATCH semántico) */
  update: (id, data) => apiClient.patch(`/atractivos/${id}`, data),

  /** Soft-delete */
  remove: (id) => apiClient.delete(`/atractivos/${id}`),

  /**
   * Sube y optimiza la imagen principal de un atractivo.
   * El backend (Pillow) la redimensiona a máx. 1080px y convierte a WebP·85.
   */
  uploadImage: (id, file, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)

    return apiClient.post(`/atractivos/${id}/imagen`, formData, {
      headers: {
        // No sobreescribir con string fijo — Axios genera el boundary correcto
        // al detectar que el body es FormData. Dejarlo en 'multipart/form-data'
        // sin boundary causaría un error 422 en FastAPI.
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60_000,
      onUploadProgress: onProgress
        ? (e) => onProgress(Math.round((e.loaded * 100) / (e.total ?? e.loaded)))
        : undefined,
    })
  },
}

// ── Servicio de Health Check ───────────────────────────────────────────────────
export const healthService = {
  /**
   * Verifica que el backend (FastAPI + PostgreSQL + PostGIS) esté en línea.
   * Usa la URL derivada de VITE_API_BASE_URL — no tiene hardcodeado localhost.
   */
  check: () => axios.get(API_HEALTH_URL, { timeout: 5_000 }),
}

export default apiClient