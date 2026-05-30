/**
 * src/main.jsx
 * ─────────────
 * Punto de entrada React. Registra el Service Worker PWA con retroalimentación
 * visual al usuario: notificación de "Nueva versión disponible" y estado offline.
 *
 * ARQUITECTURA DEL REGISTRO:
 *   vite-plugin-pwa genera automáticamente el archivo /src/registerSW.js durante
 *   el build. Ese archivo exporta el hook `useRegisterSW` que se conecta con el
 *   ciclo de vida del SW sin necesidad de llamar directamente a navigator.serviceWorker.
 *
 *   registerType: 'prompt' (vite.config.js) → el SW espera confirmación del usuario
 *   para activarse, en lugar de recargarse silenciosamente. Esto evita que el
 *   turista pierda su estado de navegación en medio de una visita.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useRegisterSW } from 'virtual:pwa-register/react'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// ── Reporte de errores ────────────────────────────────────────────────────────
const reportarError = (error, info) => {
  console.error('[ErrorBoundary]', { error, componentStack: info?.componentStack })
  // TODO: reemplazar con Sentry.captureException(error, { extra: info })
}

// ── Componente de notificación de actualización PWA ───────────────────────────
/**
 * BannerActualizacionPWA
 *
 * Aparece en la parte inferior de la pantalla cuando Workbox detecta que hay
 * una nueva versión del SW lista para instalarse.
 *
 * CUÁNDO APARECE:
 *   - El turista abre la app con conexión después de un deploy nuevo.
 *   - El SW nuevo está instalado en estado "waiting" (esperando activación).
 *   - Este componente le pregunta si quiere activar la nueva versión.
 *
 * FLUJO TÉCNICO:
 *   needRefresh = true  → hay un SW nuevo esperando
 *   offlineReady = true → el SW pre-cacheó todos los assets (app lista offline)
 *   updateServiceWorker(true) → llama a skipWaiting() en el SW → lo activa
 *                             → la página se recarga con el SW nuevo
 */
function BannerActualizacionPWA() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh:  [needRefresh,  setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // ── Callbacks del ciclo de vida del SW ───────────────────────────────────

    onRegisteredSW(swUrl, registration) {
      // El SW fue registrado exitosamente.
      // Aquí podemos configurar actualizaciones periódicas en background.
      if (import.meta.env.DEV) {
        console.log('[SW] Registrado:', swUrl)
      }

      // Verificar actualizaciones cada hora mientras la app está abierta.
      // Útil para turistas que dejan la app abierta todo el día.
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {
            // Silenciar error si no hay conexión — es esperado en modo offline.
          })
        }, 60 * 60 * 1_000) // cada 60 minutos
      }
    },

    onRegisterError(error) {
      // El SW no se pudo registrar. Puede ocurrir si:
      //   - El servidor no sirve el SW desde el mismo origen
      //   - El navegador tiene Service Workers bloqueados (modo incógnito en iOS)
      //   - Error de sintaxis en el SW generado
      console.warn('[SW] Error al registrar:', error)
    },

    onOfflineReady() {
      // Todos los assets del pre-cache fueron descargados.
      // La app puede funcionar completamente sin conexión.
      if (import.meta.env.DEV) {
        console.log('[SW] App lista para uso offline ✅')
      }
    },

    onNeedRefresh() {
      // Hay un SW nuevo esperando. Se activa el banner de actualización.
      if (import.meta.env.DEV) {
        console.log('[SW] Nueva versión disponible 🆕')
      }
    },
  })

  // ── No renderizar nada si no hay estado que mostrar ───────────────────────
  if (!offlineReady && !needRefresh) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(92vw, 420px)',
        background: '#161920',
        border: '1px solid #252830',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.875rem',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        animation: 'toast-entrar 0.3s ease both',
        // Borde de color diferente según el estado
        borderLeft: needRefresh ? '3px solid #e63946' : '3px solid #4caf79',
      }}
      role="status"
      aria-live="polite"
    >
      {/* Ícono de estado */}
      <span style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: '1px' }}>
        {needRefresh ? '🆕' : '✅'}
      </span>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: '#f0eee8',
          marginBottom: '0.2rem',
          lineHeight: 1.3,
        }}>
          {needRefresh
            ? 'Nueva versión disponible'
            : 'App lista para usar sin internet 🌿'}
        </p>
        <p style={{
          margin: 0,
          fontSize: '0.75rem',
          color: '#8892a4',
          lineHeight: 1.45,
        }}>
          {needRefresh
            ? 'Actualiza para tener los mapas y datos más recientes.'
            : 'Puedes explorar Nilo aunque pierdas la señal en las veredas.'}
        </p>
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', flexShrink: 0 }}>
        {needRefresh && (
          <button
            onClick={() => updateServiceWorker(true)}
            style={{
              background: '#e63946',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.4rem 0.875rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Actualizar
          </button>
        )}
        <button
          onClick={() => {
            setOfflineReady(false)
            setNeedRefresh(false)
          }}
          style={{
            background: 'transparent',
            color: '#5a6072',
            border: '1px solid #2e3340',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 400,
            padding: '0.4rem 0.875rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {needRefresh ? 'Después' : 'Cerrar'}
        </button>
      </div>
    </div>
  )
}

// ── Render principal ──────────────────────────────────────────────────────────
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary onError={reportarError}>
      <App />
      {/*
        BannerActualizacionPWA vive FUERA del árbol principal de App para que:
          1. Un error en App no impida que el banner aparezca.
          2. El banner no quede atrapado dentro de un contexto de scroll o overflow:hidden.
          3. Sea fácil de remover en el futuro sin tocar App.jsx.
      */}
      <BannerActualizacionPWA />
    </ErrorBoundary>
  </StrictMode>,
)