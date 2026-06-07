import { useState, useEffect, useCallback, useRef } from 'react'
import PathFinder from 'geojson-path-finder'
import * as turf from '@turf/turf'

export function useRutaOffline() {
  const [motorListo, setMotorListo] = useState(false)
  const pathfinderRef = useRef(null)
  const nodosRef = useRef(null)

  useEffect(() => {
    fetch('/red_vial_nilo.geojson')
      .then(res => res.json())
      .then(geojson => {
        // 1. Filtrar solo las líneas (calles)
        const calles = geojson.features.filter(
          feature => feature.geometry && feature.geometry.type === 'LineString'
        )
        const cleanGeojson = turf.featureCollection(calles)

        // 2. Extraer TODOS los puntos (nodos) de las calles para el "Snapping"
        const puntos = []
        calles.forEach(calle => {
          calle.geometry.coordinates.forEach(coord => {
            puntos.push(turf.point(coord))
          })
        })
        const todosLosNodos = turf.featureCollection(puntos)

        // 3. Inicializar el motor
        const pf = new PathFinder(cleanGeojson, { precision: 1e-4 })

        pathfinderRef.current = pf
        nodosRef.current = todosLosNodos
        setMotorListo(true)
        
        console.log(`✅ Motor cargado: ${calles.length} vías y ${puntos.length} nodos conectados.`)
      })
      .catch(err => console.error("❌ Error cargando red vial:", err))
  }, [])

  const calcularRuta = useCallback((inicioLat, inicioLon, destinoLat, destinoLon) => {
    if (!pathfinderRef.current || !nodosRef.current) return null

    // Posiciones reales (exactas)
    const startReal = turf.point([inicioLon, inicioLat])
    const finishReal = turf.point([destinoLon, destinoLat])

    // LÓGICA DE SNAPPING: Buscar el nodo de la calle más cercano a las posiciones reales
    const startNodo = turf.nearestPoint(startReal, nodosRef.current)
    const finishNodo = turf.nearestPoint(finishReal, nodosRef.current)

    try {
      // Trazar la ruta matemática entre los nodos de la calle
      const ruta = pathfinderRef.current.findPath(startNodo, finishNodo)
      
      if (ruta && ruta.path) {
        console.log(`✅ Ruta trazada. Distancia en la red vial: ${ruta.weight.toFixed(2)} km`)
        
        // Convertir a formato Leaflet [Lat, Lon]
        const pathLeaflet = ruta.path.map(coord => [coord[1], coord[0]])

        // Unir la posición real del usuario con la calle, y la calle con el destino
        return [
          [inicioLat, inicioLon], // Línea desde donde está parado el turista
          ...pathLeaflet,         // Todo el recorrido por la calle
          [destinoLat, destinoLon] // Línea hasta la puerta del lugar
        ]
      } else {
        console.warn("⚠️ Hay calles, pero este tramo no está conectado al resto del pueblo.")
      }
    } catch (e) {
      console.error("❌ Error en el trazado matemático:", e)
    }
    
    return null
  }, [])

  return { calcularRuta, motorListo }
}