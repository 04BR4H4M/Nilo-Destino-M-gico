/**
 * vite.config.js
 * ──────────────
 * Configuración de Vite para la PWA Offline-First de Nilo Destino Mágico.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ARQUITECTURA DEL SERVICE WORKER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  El SW tiene DOS capas de caché que trabajan juntas:
 *
 *  1. PRE-CACHE (precacheAndRoute) — generado automáticamente por Workbox en
 *     tiempo de BUILD. Cachea el "shell" de la app: index.html, los chunks
 *     de JS/CSS con hash, los assets de /public. Esta capa garantiza que la
 *     app ARRANCA sin conexión.
 *
 *  2. RUNTIME CACHE (runtimeCaching) — intercepta peticiones en tiempo de
 *     EJECUCIÓN, según las reglas definidas abajo. Esta capa garantiza que
 *     los DATOS y las IMÁGENES estén disponibles sin conexión después de
 *     una primera visita con conexión.
 *
 *  ESTRATEGIAS DISPONIBLES EN WORKBOX:
 *  ┌──────────────────────┬──────────────────────────────────────────────┐
 *  │ CacheFirst           │ Caché → Red. Máximo ahorro de datos.          │
 *  │                      │ Ideal: assets que casi nunca cambian.          │
 *  ├──────────────────────┼──────────────────────────────────────────────┤
 *  │ NetworkFirst         │ Red → Caché. Máxima frescura de datos.         │
 *  │                      │ Ideal: APIs con datos que cambian.             │
 *  ├──────────────────────┼──────────────────────────────────────────────┤
 *  │ StaleWhileRevalidate │ Caché inmediato + actualiza en background.     │
 *  │                      │ Ideal: tiles de mapa, fuentes, avatares.       │
 *  ├──────────────────────┼──────────────────────────────────────────────┤
 *  │ NetworkOnly          │ Solo red. Sin caché.                           │
 *  │ CacheOnly            │ Solo caché. Sin red.                           │
 *  └──────────────────────┴──────────────────────────────────────────────┘
 *
 *  ORDEN DE LAS REGLAS: Workbox evalúa runtimeCaching de ARRIBA hacia ABAJO
 *  y usa la PRIMERA regla cuyo urlPattern coincida. Poner las más específicas
 *  primero (API, uploads) y las más generales al final (tiles OSM).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // loadEnv expone las variables del .env al vite.config.js en tiempo de build.
  // El tercer argumento '' carga TODAS las variables, no solo las VITE_*.
  // Necesario para leer VITE_API_BASE_URL y construir el urlPattern dinámicamente.
  const env = loadEnv(mode, process.cwd(), '')

  // URL base del backend. En CI/CD puede venir de la variable de entorno del sistema.
  // Fallback a localhost para desarrollo local sin .env.
  const API_BASE_URL = env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1'

  // Extraer solo el origen (scheme + host + port) para el patrón de CORS y SW.
  // "http://127.0.0.1:8000/api/v1" → "http://127.0.0.1:8000"
  const API_ORIGIN = new URL(API_BASE_URL).origin

  // Duración en segundos — constantes nombradas para que las reglas sean legibles.
  const DIA_EN_SEGUNDOS     =      86_400   //  1 día
  const QUINCE_DIAS_EN_SEG  =   1_296_000   // 15 días
  const TREINTA_DIAS_EN_SEG =   2_592_000   // 30 días
  const UN_ANO_EN_SEGUNDOS  =  31_536_000   //  1 año

  return {
    plugins: [
      react(),
      VitePWA({
        // ── Modo de registro del Service Worker ───────────────────────────────
        //
        // 'autoUpdate': el SW se instala y actualiza silenciosamente sin
        //   interrumpir al usuario. Al detectar una nueva versión, espera
        //   a que todas las pestañas cierren para activarse.
        //   MEJOR para apps de producción donde la consistencia importa.
        //
        // 'prompt': muestra un banner "Nueva versión disponible" para que
        //   el usuario decida cuándo actualizar.
        //   MEJOR si quieres control explícito (ver useRegisterSW en main.jsx).
        //
        registerType: 'prompt',

        // ── Service Worker en modo desarrollo ────────────────────────────────
        // Permite probar el comportamiento offline sin hacer `vite build`.
        // El SW de desarrollo usa InjectManifest mode que no pre-cachea assets
        // (para no interferir con HMR), pero SÍ aplica las reglas runtimeCaching.
        devOptions: {
          enabled: true,
          type: 'module',   // ESM en desarrollo — más rápido de cargar
          navigateFallback: 'index.html',
        },

        // ── Assets incluidos en el pre-cache ─────────────────────────────────
        // Workbox añade estos al precacheAndRoute() automáticamente.
        // Son los archivos que hacen que la APP SHELL cargue offline.
        includeAssets: [
          'favicon.ico',
          'favicon.svg',
          'apple-touch-icon.png',
          'icons/*.png',
          'fonts/*.woff2',
        ],

        // ── Web App Manifest ──────────────────────────────────────────────────
        manifest: {
          name: 'Nilo Destino Mágico',
          short_name: 'Nilo',
          description:
            'Descubre los atractivos turísticos, rutas históricas y prestadores de servicios de Nilo, Cundinamarca.',
          lang: 'es',
          theme_color: '#1a1208',
          background_color: '#f5ede0',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/?utm_source=pwa',
          categories: ['travel', 'lifestyle', 'navigation'],
          icons: [
            { src: 'icons/icon-72.png',           sizes: '72x72',   type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-96.png',            sizes: '96x96',   type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-128.png',           sizes: '128x128', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-192.png',           sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png',           sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512-maskable.png',  sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            {
              name: 'Mapa de Atractivos',
              short_name: 'Mapa',
              url: '/mapa',
              icons: [{ src: 'icons/shortcut-mapa.png', sizes: '96x96' }],
            },
            {
              name: 'Rutas Históricas',
              short_name: 'Rutas',
              url: '/rutas',
              icons: [{ src: 'icons/shortcut-rutas.png', sizes: '96x96' }],
            },
          ],
          screenshots: [
            {
              src: 'screenshots/mapa-mobile.png',
              sizes: '390x844',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Mapa de atractivos en móvil',
            },
          ],
        },

        // ════════════════════════════════════════════════════════════════════
        //  WORKBOX — CONFIGURACIÓN CENTRAL
        // ════════════════════════════════════════════════════════════════════
        workbox: {

          // ── Patrón de navegación (SPA) ────────────────────────────────────
          // Cuando el usuario navega a una ruta como /mapa o /atractivos/123
          // que no existe como archivo físico, Workbox sirve index.html desde
          // caché en lugar de devolver un 404. Esencial para React Router.
          navigateFallback: 'index.html',

          // Excluir rutas de API y archivos estáticos del navigateFallback.
          // Si no se excluyen, las peticiones fetch a /api/* también recibirían
          // index.html como respuesta cuando están offline — un bug silencioso.
          navigateFallbackDenylist: [
            /^\/api\//,       // llamadas al backend
            /^\/static\//,    // imágenes y uploads
            /\/sw\.js$/,      // el propio service worker
            /\/workbox-.*\.js$/,
          ],

          // ── Límite de tamaño para pre-cache ──────────────────────────────
          // Assets mayores a este límite no entran en el pre-cache para no
          // saturar la cuota de almacenamiento del navegador en el primer load.
          // Los chunks grandes (Three.js, Leaflet) quedan en runtimeCaching.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB

          // ── REGLAS DE RUNTIME CACHING ─────────────────────────────────────
          // Evaluadas EN ORDEN — la primera que coincide gana.
          runtimeCaching: [

            // ════════════════════════════════════════════════════════════════
            //  REGLA 1 — API TURÍSTICA: NetworkFirst
            // ════════════════════════════════════════════════════════════════
            //
            //  FLUJO:
            //    1. SW intenta obtener la respuesta de la RED.
            //    2. Si la red responde en < networkTimeoutSeconds → sirve y cachea.
            //    3. Si la red tarda demasiado o falla → sirve desde CACHÉ.
            //    4. Si no hay caché → error (el componente React debe manejar esto).
            //
            //  POR QUÉ NetworkFirst para la API:
            //    Los datos de atractivos, rutas y prestadores cambian con frecuencia.
            //    Un turista que abre la app con señal débil debe ver datos actualizados,
            //    no datos de hace 3 días. Pero si está en las montañas sin señal,
            //    debe ver algo —aunque sea la versión cacheada— en lugar de un error.
            //
            //  EL URLPATTERN ES DINÁMICO:
            //    Construido desde VITE_API_BASE_URL para que funcione tanto en
            //    desarrollo (http://127.0.0.1:8000) como en producción
            //    (https://api.nilodestino.gov.co). Sin esto, las reglas del SW
            //    compilado en producción seguirían apuntando a localhost.
            {
              // Coincide con cualquier URL que contenga el origen de la API
              // seguido de /api/v1/ o /api/ (health check incluido).
              // Ejemplo match: http://127.0.0.1:8000/api/v1/atractivos
              // Ejemplo match: https://api.midominio.com/api/v1/atractivos/cercanos
              urlPattern: new RegExp(`^${escapeRegExp(API_ORIGIN)}/api/`),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'nilo-api-v1',

                // Tiempo máximo de espera a la red antes de usar el caché.
                // 4 segundos es un balance entre experiencia y ahorro de datos.
                // En zonas con señal muy débil (1 bar), 4s puede ser suficiente
                // para completar una petición JSON ligera.
                networkTimeoutSeconds: 4,

                matchOptions: {
                  ignoreSearch: true,
                },
                
                expiration: {
                  // Máximo de rutas API distintas en caché.
                  // 60 cubre: listado de atractivos, 30 fichas individuales,
                  // health check, listado de categorías, etc.
                  maxEntries: 60,

                  // Los datos se consideran "válidos" por 24 horas.
                  // Si el turista abre la app offline al día siguiente,
                  // verá los datos pero con una advertencia de "datos de ayer".
                  maxAgeSeconds: DIA_EN_SEGUNDOS,
                },

                // Solo cachear respuestas exitosas (200) y opaque responses (0).
                // status 0 = respuesta opaca de una petición cross-origin sin CORS.
                // Incluir 0 garantiza que funcione si el servidor responde desde
                // un CDN sin headers CORS configurados.
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },

            // ════════════════════════════════════════════════════════════════
            //  REGLA 2 — IMÁGENES DE ATRACTIVOS: CacheFirst + Expiration
            // ════════════════════════════════════════════════════════════════
            //
            //  FLUJO:
            //    1. SW busca la imagen en CACHÉ.
            //    2. Si está en caché (y no expiró) → sirve sin tocar la red. ✓
            //    3. Si NO está en caché → descarga de la red, guarda en caché.
            //    4. Si no hay red y no hay caché → error (mostrar placeholder).
            //
            //  POR QUÉ CacheFirst para imágenes:
            //    Las fotos de los atractivos rara vez cambian. Un turista en el
            //    campo no puede darse el lujo de re-descargar cada foto al navegar.
            //    El plugin ExpirationPlugin actúa como vigilante:
            //      - maxEntries: 50 → si se llega a 51, elimina la más antigua (LRU).
            //      - maxAgeSeconds: 15 días → después de 15 días sin verse, se elimina.
            //    Esto previene que el almacenamiento del teléfono se llene con fotos
            //    de atractivos que el turista nunca visitará.
            //
            //  EL URLPATTERN TAMBIÉN ES DINÁMICO:
            //    Coincide con /static/uploads/ en cualquier servidor, no solo localhost.
            {
              urlPattern: new RegExp(`^${escapeRegExp(API_ORIGIN)}/static/uploads/`),
              handler: 'CacheFirst',
              options: {
                cacheName: 'nilo-imagenes-atractivos-v1',

                expiration: {
                  // Máximo 50 imágenes. En promedio, una imagen WebP·85 optimizada
                  // por Pillow pesa ~80-150 KB. 50 imágenes ≈ 4-7 MB. Razonable
                  // para el almacenamiento típico de una PWA (cuota ~6% del disco).
                  maxEntries: 50,

                  // 15 días = tiempo razonable para una visita turística.
                  // El turista que llegó en vacaciones y vuelve el siguiente mes
                  // verá imágenes frescas porque las anteriores habrán expirado.
                  maxAgeSeconds: QUINCE_DIAS_EN_SEG,
                },

                cacheableResponse: {
                  // status 0: imágenes opacas de CDN cross-origin
                  // status 200: respuesta normal del servidor
                  statuses: [0, 200],
                },
              },
            },

            // ════════════════════════════════════════════════════════════════
            //  REGLA 3 — TILES DE OPENSTREETMAP: StaleWhileRevalidate
            // ════════════════════════════════════════════════════════════════
            //
            //  FLUJO:
            //    1. SW busca el tile en CACHÉ.
            //    2. Si está en caché → lo sirve INMEDIATAMENTE (sin esperar red).
            //    3. En BACKGROUND, hace una petición a la red para actualizar el tile.
            //    4. La próxima vez que se pida el tile, ya tendrá la versión fresca.
            //    5. Si no hay caché → descarga de la red y guarda.
            //
            //  POR QUÉ StaleWhileRevalidate para tiles:
            //    Los tiles de OSM cambian ocasionalmente (nuevas calles, correcciones),
            //    pero no a diario. StaleWhileRevalidate da la mejor experiencia:
            //    el mapa carga instantáneamente (desde caché) mientras se actualiza
            //    silenciosamente en background. Es el balance óptimo entre velocidad
            //    y frescura para datos cartográficos.
            //
            //  SUBDOMINOS a-c de OSM:
            //    OpenStreetMap usa balanceo de carga con subdominios a.tile, b.tile,
            //    c.tile (y el subdomain {s} de Leaflet rota entre ellos).
            //    El patrón [a-c] captura todos. También se incluye tile.openstreetmap.org
            //    sin subdomain como fallback.
            {
              urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.+\.png$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'nilo-tiles-osm-v1',

                expiration: {
                  // 500 tiles ≈ área de ~5x5 km en zoom 15, suficiente para
                  // cubrir el casco urbano + veredas más cercanas.
                  // Un tile PNG de OSM pesa ~10-30 KB → 500 tiles ≈ 5-15 MB.
                  maxEntries: 500,

                  // 30 días: los datos de OSM para municipios rurales cambian
                  // muy poco. Este TTL da frescura razonable sin re-descargas constantes.
                  maxAgeSeconds: TREINTA_DIAS_EN_SEG,
                },

                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },

            // ════════════════════════════════════════════════════════════════
            //  REGLA 4 — TILES OSM SIN SUBDOMAIN (fallback)
            // ════════════════════════════════════════════════════════════════
            //  Cubre: https://tile.openstreetmap.org/...
            //  Misma estrategia y parámetros que la Regla 3.
            {
              urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.+\.png$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'nilo-tiles-osm-v1',   // mismo caché que la regla anterior
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: TREINTA_DIAS_EN_SEG,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },

            // ════════════════════════════════════════════════════════════════
            //  REGLA 5 — TILES OSM HUMANITARIAN (hot)
            // ════════════════════════════════════════════════════════════════
            //  El componente MapaTuristico.jsx usa el servidor "hot" (Humanitarian):
            //  https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png
            //  Misma estrategia y caché que OSM estándar.
            {
              urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.fr\/hot\/.+\.png$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'nilo-tiles-osm-v1',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: TREINTA_DIAS_EN_SEG,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },

            // ════════════════════════════════════════════════════════════════
            //  REGLA 6 — FUENTES WEB (Google Fonts): CacheFirst 1 año
            // ════════════════════════════════════════════════════════════════
            //  Playfair Display y DM Sans se cargan desde Google Fonts.
            //  Las fuentes son inmutables (el hash de versión cambia, no la URL
            //  base), así que CacheFirst con 1 año es seguro.
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'nilo-fuentes-v1',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: UN_ANO_EN_SEGUNDOS,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },

          ], // fin runtimeCaching
        }, // fin workbox
      }), // fin VitePWA
    ], // fin plugins

    // ── Servidor de desarrollo ───────────────────────────────────────────────
    server: {
      port: 5173,

      // Proxy para evitar CORS en desarrollo: /api → http://127.0.0.1:8000
      // Esto NO afecta al SW — el SW intercepta las peticiones del navegador
      // a las URLs reales, no las peticiones a través del proxy de Vite.
      // En producción este proxy no existe; el browser llama directamente a
      // la URL de VITE_API_BASE_URL.
      proxy: {
        '/api': {
          target: API_ORIGIN,
          changeOrigin: true,
          secure: false,
        },
        '/static': {
          target: API_ORIGIN,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    // ── Build de producción ──────────────────────────────────────────────────
    build: {
      // Separar vendors grandes en chunks propios para mejor caching.
      // Leaflet y React no se actualizan cada deploy → el browser los cachea
      // de forma independiente del código de la app.
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react':   ['react', 'react-dom'],
            'vendor-leaflet': ['leaflet', 'react-leaflet'],
            'vendor-axios':   ['axios'],
          },
        },
      },
    },
  }
})

// ── Utilidad: escapar caracteres especiales de RegExp ───────────────────────
// Necesaria para construir RegExp dinámicamente desde URLs que pueden contener
// puntos, barras y otros caracteres que tienen significado especial en RegExp.
//
// Ejemplo: "http://127.0.0.1:8000" → "http://127\.0\.0\.1:8000"
//          Sin escapar, el punto . en RegExp significa "cualquier carácter".
//
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}