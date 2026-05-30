/**
 * src/utils/geoCompass.js
 * ─────────────────
 * Utilidades de geometría esférica para filtrado client-side.
 */

const RADIO_TIERRA_M = 6_371_000

const toRad = (deg) => deg * (Math.PI / 180)

/**
 * Distancia entre dos puntos GPS usando Haversine.
 */
export function haversineM(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2

  return RADIO_TIERRA_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Azimut (rumbo) desde el punto A hacia el punto B.
 * 0° = Norte, 90° = Este.
 */
export function azimutGrados(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const dLon = toRad(lon2 - lon1)

  const y = Math.sin(dLon) * Math.cos(φ2)

  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Convierte el rumbo a dirección cardinal amigable.
 * Usada en los popups del mapa.
 */
export function calcularDireccionCardinal(lat1, lon1, lat2, lon2) {
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null
  ) {
    return ""
  }

  const brng = azimutGrados(lat1, lon1, lat2, lon2)

  const direcciones = [
    "Norte ⬆️",
    "Noreste ↗️",
    "Este ➡️",
    "Sureste ↘️",
    "Sur ⬇️",
    "Suroeste ↙️",
    "Oeste ⬅️",
    "Noroeste ↖️"
  ]

  const indice = Math.round(brng / 45) % 8

  return direcciones[indice]
}

/**
 * Extrae coordenadas [lat, lon] de un atractivo.
 */
export function extraerCoords(atractivo) {
  if (atractivo.geom_wkt) {
    const m = atractivo.geom_wkt.match(
      /POINT[^(]*\(\s*([-\d.]+)\s+([-\d.]+)/
    )

    if (m) {
      return [parseFloat(m[2]), parseFloat(m[1])]
    }
  }

  if (atractivo.lat != null && atractivo.lon != null) {
    return [Number(atractivo.lat), Number(atractivo.lon)]
  }

  return null
}

/**
 * Filtra atractivos dentro de un radio.
 */
export function filtrarPorRadio(
  catalogo,
  centroLat,
  centroLon,
  radioM
) {
  const resultado = []

  for (const atractivo of catalogo) {
    const coords = extraerCoords(atractivo)

    if (!coords) continue

    const [atrLat, atrLon] = coords

    const distancia = haversineM(
      centroLat,
      centroLon,
      atrLat,
      atrLon
    )

    if (distancia <= radioM) {
      resultado.push({
        ...atractivo,
        distancia_m: Math.round(distancia)
      })
    }
  }

  resultado.sort(
    (a, b) => a.distancia_m - b.distancia_m
  )

  return resultado
}