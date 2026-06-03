/**
 * src/hooks/useCatalogo.js
 * ─────────────────────────
 * Hook de "JSON Maestro": descarga el catálogo completo UNA sola vez,
 * lo persiste en IndexedDB para uso offline, y expone una función de
 * filtrado local basada en Haversine.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ARQUITECTURA: POR QUÉ INDEXEDDB Y NO LOCALSTORAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  localStorage:
 *    - Límite de ~5 MB (varía por navegador).
 *    - Síncrono: bloquea el hilo principal al leer/escribir.
 *    - Solo admite strings → hay que JSON.stringify/parse manualmente.
 *    - Suficiente para pocos KB de configuración, NO para catálogos JSON.
 *
 *  IndexedDB:
 *    - Límite de ~50% del disco disponible (Chrome/Firefox).
 *    - Completamente asíncrono (no bloquea la UI).
 *    - Admite objetos JavaScript nativos (sin serialización manual).
 *    - Persiste entre sesiones aunque el Service Worker se actualice.
 *    - Es la opción correcta para catálogos de datos estructurados.
 *
 *  Para el catálogo de ~50-200 atractivos turísticos (~200 KB de JSON
 *  incluyendo descripciones y URLs de imágenes), IndexedDB es la única
 *  opción que funciona de forma fiable en todos los navegadores modernos.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  FLUJO COMPLETO DE ESTADOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  1ª apertura CON internet:
 *    idle → cargando → listo (catálogo en memoria + guardado en IDB)
 *
 *  Apertura siguiente CON internet:
 *    idle → cargando-idb → listo (desde IDB) → revalidando → listo (fresco)
 *    (el turista ve datos inmediatamente, actualización en background)
 *
 *  Apertura SIN internet:
 *    idle → cargando-idb → listo (desde IDB) o sin-datos
 *
 *  1ª apertura SIN internet (nunca descargó):
 *    idle → cargando-idb → sin-datos (mostrar mensaje de "necesitas conexión")
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { atractivosService } from '../services/api'
import { filtrarPorRadio } from '../utils/geoCompass'

// ── Constantes de IndexedDB ────────────────────────────────────────────────────
const IDB_NAME        = 'nilo-catalogo-db'
const IDB_VERSION     = 1
const IDB_STORE       = 'catalogo'
const IDB_KEY         = 'atractivos-maestro'

// Tiempo máximo que consideramos el catálogo "fresco" sin revalidar.
// Si el registro en IDB tiene menos de TTLS segundos de antigüedad
// y el usuario tiene conexión, igual hacemos revalidación en background.
// Este valor controla cuándo mostramos el indicador "actualizando".
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000 // 6 horas

// ── Capa de acceso a IndexedDB ─────────────────────────────────────────────────
// Funciones independientes del hook — facilitan testing unitario.

function abrirIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        // keyPath: 'key' — el registro se identifica por una clave string.
        // No usamos autoincrement porque solo tenemos un registro maestro.
        db.createObjectStore(IDB_STORE, { keyPath: 'key' })
      }
    }

    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror   = () => reject(req.error)
  })
}

async function leerDeIDB() {
  try {
    const db     = await abrirIDB()
    const tx     = db.transaction(IDB_STORE, 'readonly')
    const store  = tx.objectStore(IDB_STORE)

    return new Promise((resolve) => {
      const req = store.get(IDB_KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror   = () => resolve(null) // falla silenciosa — intentará la red
    })
  } catch {
    return null
  }
}

async function guardarEnIDB(atractivos) {
  try {
    const db    = await abrirIDB()
    const tx    = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)

    // guardadoEn se usa para calcular la antigüedad del caché
    store.put({ key: IDB_KEY, atractivos, guardadoEn: Date.now() })

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror    = () => resolve(false)
    })
  } catch {
    return false
  }
}

// ── Hook principal ─────────────────────────────────────────────────────────────

/**
 * @typedef {'idle'|'cargando-idb'|'cargando-red'|'revalidando'|'listo'|'sin-datos'|'error'} EstadoCatalogo
 *
 * @typedef {object} ResultadoCatalogo
 * @property {object[]}         catalogo         - Array maestro completo (inmutable mientras se usa)
 * @property {EstadoCatalogo}   estado            - Estado actual del ciclo de vida
 * @property {string|null}      error             - Mensaje de error legible, o null
 * @property {boolean}          estaOffline       - true si navigator.onLine === false
 * @property {boolean}          datosDesdeCache   - true si los datos actuales vienen de IDB
 * @property {Date|null}        actualizadoEn     - Cuándo se guardó el catálogo en IDB
 * @property {Function}         filtrar           - filtrar(lat, lon, radioM) → atractivos filtrados
 * @property {Function}         forzarSincronizar - Fuerza una petición a la red aunque haya caché
 */

/**
 * useCatalogo
 *
 * Descarga el catálogo completo UNA sola vez y lo persiste en IndexedDB.
 * El filtrado por radio se hace localmente con Haversine — sin red.
 *
 * @returns {ResultadoCatalogo}
 */
export function useCatalogo() {
  // ── Estado del hook ──────────────────────────────────────────────────────────
  const [catalogo, setCatalogo]               = useState([])
  const [estado, setEstado]                   = useState('idle')
  const [error, setError]                     = useState(null)
  const [estaOffline, setEstaOffline]         = useState(!navigator.onLine)
  const [datosDesdeCache, setDatosDesdeCache] = useState(false)
  const [actualizadoEn, setActualizadoEn]     = useState(null)

  // Ref para cancelar la petición de red si el componente se desmonta
  const controladorRef = useRef(null)

  // ── Eventos de conexión ───────────────────────────────────────────────────────
  useEffect(() => {
    const alConectar   = () => setEstaOffline(false)
    const alDesconectar = () => setEstaOffline(true)

    window.addEventListener('online',  alConectar)
    window.addEventListener('offline', alDesconectar)
    return () => {
      window.removeEventListener('online',  alConectar)
      window.removeEventListener('offline', alDesconectar)
    }
  }, [])

  // ── Función de sincronización con la red ──────────────────────────────────────
  const sincronizarDesdeRed = useCallback(async (enBackground = false) => {
    // Cancelar petición anterior si existe
    controladorRef.current?.abort()
    controladorRef.current = new AbortController()

    setEstado(enBackground ? 'revalidando' : 'cargando-red')
    setError(null)

    try {
      // Solicitar TODO el catálogo — sin paginación, sin filtros geoespaciales.
      // por_pagina=1000: ajustar si el municipio tiene más de 1000 atractivos.
      const { data } = await atractivosService.getAll()

      // La API devuelve { items: [...], total, pagina, por_pagina }
      const items = data?.items ?? (Array.isArray(data) ? data : [])

      if (items.length === 0 && !enBackground) {
        // Si la API devuelve vacío en la carga inicial, es sospechoso.
        // Mantener el catálogo actual (puede venir de IDB) y loggear.
        console.warn('[useCatalogo] La API devolvió 0 atractivos. ¿Hay datos en el backend?')
      }

      if (items.length > 0) {
        setCatalogo(items)
        setDatosDesdeCache(false)
        setActualizadoEn(new Date())
        await guardarEnIDB(items)
      }

      setEstado('listo')
    } catch (err) {
      if (err.name === 'AbortError') return // desmontaje limpio

      const mensaje = err.response?.data?.detail
        ?? (estaOffline ? 'Sin conexión a internet.' : 'No se pudo conectar con el servidor.')

      if (!enBackground) {
        // Error en carga inicial: exponer al usuario
        setError(mensaje)
        setEstado(catalogo.length > 0 ? 'listo' : 'error')
      } else {
        // Error en revalidación background: silencioso — el turista ya tiene datos
        console.warn('[useCatalogo] Revalidación en background falló:', mensaje)
        setEstado('listo')
      }
    }
  }, [estaOffline, catalogo.length])

  // ── Carga inicial: IDB primero, red en background ─────────────────────────────
  useEffect(() => {
    let cancelado = false

    async function inicializar() {
      setEstado('cargando-idb')

      // 1. Intentar IndexedDB primero (instantáneo, offline-safe)
      const registro = await leerDeIDB()

      if (registro?.atractivos?.length > 0) {
        if (!cancelado) {
          setCatalogo(registro.atractivos)
          setDatosDesdeCache(true)
          setActualizadoEn(new Date(registro.guardadoEn))
          setEstado('listo')
        }

        // 2. Si hay conexión, revalidar en background silenciosamente
        //    independientemente de si el caché es "fresco" o no.
        //    En zonas rurales el turista puede estar días sin conexión;
        //    cuando la recupera queremos datos actualizados sin interrumpirle.
        if (navigator.onLine && !cancelado) {
          await sincronizarDesdeRed(true) // background = true → silencioso
        }
      } else {
        // Sin datos en IDB → necesitamos la red obligatoriamente
        if (!cancelado) {
          if (navigator.onLine) {
            await sincronizarDesdeRed(false) // foreground → muestra loading
          } else {
            // Sin IDB y sin red: no podemos hacer nada
            setEstado('sin-datos')
            setError(
              'No hay datos disponibles offline. Abre la app con conexión a internet para descargar el catálogo.',
            )
          }
        }
      }
    }

    inicializar()

    return () => {
      cancelado = true
      controladorRef.current?.abort()
    }
  }, []) // Solo en el montaje inicial — intencional

  // ── API pública: filtrar ───────────────────────────────────────────────────────
  /**
   * Filtra el catálogo por radio alrededor de un punto GPS.
   * Ejecuta Haversine en JavaScript — sin red, sin latencia.
   *
   * Memoizado: solo recalcula cuando cambia el catálogo, el centro o el radio.
   * Devuelve una función estable que MapaTuristico puede llamar en cualquier momento.
   */
  const filtrar = useCallback(
    (centroLat, centroLon, radioM) => filtrarPorRadio(catalogo, centroLat, centroLon, radioM),
    [catalogo],
  )

  return {
    catalogo,
    estado,
    error,
    estaOffline,
    datosDesdeCache,
    actualizadoEn,
    filtrar,
    forzarSincronizar: () => sincronizarDesdeRed(false),
  }
}