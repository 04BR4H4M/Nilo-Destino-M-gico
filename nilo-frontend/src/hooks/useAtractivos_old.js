/**
 * src/hooks/useAtractivos.js
 * ───────────────────────────
 * Hook que encapsula la consulta de atractivos cercanos.
 * Separa el fetching del componente de mapa para facilitar testing y reutilización.
 */

import { useState, useEffect, useCallback } from 'react'
import { atractivosService } from '../services/api'

/**
 * @param {object} coords  - { lon, lat, radioM }
 * @param {boolean} enabled - si es false no dispara la consulta (lazy)
 */
export function useAtractivos(
  { lon = -74.634, lat = 4.305, radioM = 5000 } = {},
  enabled = true,
) {
  const [atractivos, setAtractivos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchAtractivos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await atractivosService.getCercanos(lon, lat, radioM)
      setAtractivos(data)
    } catch (err) {
      const isOffline = !navigator.onLine
      setError(
        isOffline
          ? 'Sin conexión. Mostrando datos en caché.'
          : err.response?.data?.detail ?? 'No se pudieron cargar los atractivos.',
      )
    } finally {
      setLoading(false)
    }
  }, [lon, lat, radioM])

  useEffect(() => {
    if (enabled) fetchAtractivos()
  }, [fetchAtractivos, enabled])

  return { atractivos, loading, error, refetch: fetchAtractivos }
}