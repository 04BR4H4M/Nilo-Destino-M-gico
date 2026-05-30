/**
 * src/components/ErrorBoundary.jsx
 * ──────────────────────────────────
 * Límite de errores (Error Boundary) para la plataforma turística Nilo.
 *
 * Por qué debe ser una clase:
 *   Los hooks de React (useState, useEffect) no pueden reemplazar los métodos
 *   del ciclo de vida `getDerivedStateFromError` y `componentDidCatch`, que son
 *   los únicos puntos donde React permite interceptar errores de renderizado.
 *   No existe un hook equivalente. Esta es la única excepción documentada donde
 *   se necesita una clase en una aplicación React moderna.
 *
 * Qué atrapa y qué NO atrapa:
 *   ✅ Errores en el render() de un componente hijo
 *   ✅ Errores en constructores de componentes hijos
 *   ✅ Errores en métodos del ciclo de vida (componentDidMount, etc.)
 *   ❌ Errores en event handlers (usar try/catch local)
 *   ❌ Errores en código asíncrono (async/await, Promises)
 *   ❌ Errores en el propio ErrorBoundary
 *   ❌ Errores en Server-Side Rendering
 *
 * Estrategia de reporte:
 *   En producción, el error se envía a la consola y se deja preparado el
 *   gancho `onError` prop para integrar un servicio externo (Sentry, LogRocket).
 *   En desarrollo se muestra el stack técnico completo en pantalla.
 */

import { Component } from 'react'

// ── Detección de entorno ──────────────────────────────────────────────────────
// import.meta.env.DEV es true en `vite dev`, false en `vite build`.
// Se evalúa una sola vez al cargar el módulo (no en cada render).
const ES_DESARROLLO = import.meta.env.DEV

// ── CSS inline (sin dependencia de archivos externos) ─────────────────────────
// El ErrorBoundary debe ser autosuficiente: si hay un error en el árbol de CSS
// global, él mismo podría verse afectado. CSS inline garantiza que siempre
// tenga estilos, aunque todo lo demás falle.
const ESTILOS = {
  // ── Contenedor principal ──────────────────────────────────────────────────
  pagina: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    background: 'linear-gradient(160deg, #0f1117 0%, #1a1208 100%)',
  },
  tarjeta: {
    maxWidth: 680,
    width: '100%',
    background: '#161920',
    border: '1px solid #252830',
    borderRadius: 16,
    padding: 'clamp(1.5rem, 4vw, 2.5rem)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
  },

  // ── Cabecera ──────────────────────────────────────────────────────────────
  cabecera: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  emblema: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #c8830a, #6b4226)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    flexShrink: 0,
    boxShadow: '0 0 0 2px rgba(200,131,10,0.3)',
  },
  textosCabecera: { flex: 1 },
  eyebrow: {
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontWeight: 600,
    color: '#e63946',
    marginBottom: 4,
    display: 'block',
  },
  titulo: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 'clamp(1.25rem, 3vw, 1.625rem)',
    fontWeight: 700,
    color: '#f0eee8',
    lineHeight: 1.15,
    margin: 0,
  },

  // ── Mensaje al turista ────────────────────────────────────────────────────
  mensajePublico: {
    fontSize: '0.9rem',
    color: '#8892a4',
    lineHeight: 1.65,
    marginBottom: '1.75rem',
    paddingBottom: '1.5rem',
    borderBottom: '1px solid #1e2128',
  },

  // ── Bloque técnico (solo desarrollo) ─────────────────────────────────────
  bloqueError: {
    background: '#0a0c11',
    border: '1px solid #2e3340',
    borderLeft: '3px solid #e63946',
    borderRadius: 8,
    padding: '1rem 1.125rem',
    marginBottom: '1.5rem',
    overflow: 'hidden',
  },
  bloqueErrorTitulo: {
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: 600,
    color: '#e63946',
    marginBottom: '0.5rem',
    display: 'block',
  },
  mensajeError: {
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: '0.8rem',
    color: '#f4a261',
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  bloqueStack: {
    background: '#0a0c11',
    border: '1px solid #2e3340',
    borderLeft: '3px solid #5a6072',
    borderRadius: 8,
    padding: '1rem 1.125rem',
    marginBottom: '1.5rem',
    maxHeight: 260,
    overflow: 'auto',
  },
  bloqueStackTitulo: {
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: 600,
    color: '#5a6072',
    marginBottom: '0.5rem',
    display: 'block',
  },
  stack: {
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: '0.72rem',
    color: '#4a5568',
    lineHeight: 1.7,
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },

  // ── Pista de acción (desarrollo) ─────────────────────────────────────────
  pistaDesarrollo: {
    background: 'rgba(200,131,10,0.08)',
    border: '1px solid rgba(200,131,10,0.2)',
    borderRadius: 8,
    padding: '0.75rem 1rem',
    marginBottom: '1.5rem',
    fontSize: '0.8rem',
    color: '#c8830a',
    lineHeight: 1.55,
  },

  // ── Acciones ──────────────────────────────────────────────────────────────
  acciones: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  btnPrimario: {
    background: '#e63946',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: '0.7rem 1.5rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'background 0.2s',
  },
  btnSecundario: {
    background: 'transparent',
    color: '#5a6072',
    border: '1px solid #252830',
    borderRadius: 8,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: '0.875rem',
    fontWeight: 400,
    padding: '0.7rem 1.25rem',
    cursor: 'pointer',
  },
  versionBadge: {
    marginLeft: 'auto',
    fontSize: '0.6875rem',
    color: '#3d4455',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
}

// ── Icono de recarga en SVG puro ──────────────────────────────────────────────
function IconoRecarga() {
  return (
    <svg
      viewBox="0 0 20 20"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 10a7 7 0 0 1 7-7 7.28 7.28 0 0 1 5.18 2.18L17 7" />
      <path d="M17 3v4h-4" />
      <path d="M17 10a7 7 0 0 1-7 7 7.28 7.28 0 0 1-5.18-2.18L3 13" />
      <path d="M3 17v-4h4" />
    </svg>
  )
}

// ── UI de fallback en PRODUCCIÓN ──────────────────────────────────────────────
function FallbackProduccion({ onRecargar }) {
  return (
    <div style={ESTILOS.pagina} role="alert" aria-live="assertive">
      <div style={ESTILOS.tarjeta}>
        <div style={ESTILOS.cabecera}>
          <div style={ESTILOS.emblema} aria-hidden="true">🌿</div>
          <div style={ESTILOS.textosCabecera}>
            <span style={ESTILOS.eyebrow}>Nilo · Destino Mágico</span>
            <h1 style={ESTILOS.titulo}>
              Algo salió mal en nuestra ruta
            </h1>
          </div>
        </div>

        <p style={ESTILOS.mensajePublico}>
          Encontramos un problema inesperado mientras cargábamos la plataforma.
          Nuestro equipo ya fue notificado automáticamente. Por favor, recarga
          la página para continuar explorando Nilo — en la mayoría de casos
          esto resuelve el inconveniente.
        </p>

        <div style={ESTILOS.acciones}>
          <button
            style={ESTILOS.btnPrimario}
            onClick={onRecargar}
            onMouseOver={(e) => e.currentTarget.style.background = '#c1121f'}
            onMouseOut={(e)  => e.currentTarget.style.background = '#e63946'}
          >
            <IconoRecarga />
            Recargar aplicación
          </button>

          <button
            style={ESTILOS.btnSecundario}
            onClick={() => window.history.back()}
            onMouseOver={(e) => e.currentTarget.style.color = '#d8d4cc'}
            onMouseOut={(e)  => e.currentTarget.style.color = '#5a6072'}
          >
            Volver atrás
          </button>

          <span style={ESTILOS.versionBadge}>
            v{import.meta.env.VITE_APP_VERSION ?? '1.0.0'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── UI de fallback en DESARROLLO ──────────────────────────────────────────────
// Muestra toda la información técnica para agilizar la depuración.
function FallbackDesarrollo({ error, componentStack, onRecargar, onReintentar }) {
  // Copiar el stack al portapapeles
  const copiarStack = async () => {
    const texto = [
      `ERROR: ${error?.message}`,
      '',
      'Component Stack:',
      componentStack,
      '',
      'JS Stack:',
      error?.stack,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(texto)
      alert('Stack copiado al portapapeles ✅')
    } catch {
      // Fallback si clipboard no está disponible
      console.info('Stack completo:', texto)
      alert('Revisa la consola del navegador (F12)')
    }
  }

  return (
    <div style={ESTILOS.pagina} role="alert" aria-live="assertive">
      <div style={{ ...ESTILOS.tarjeta, maxWidth: 780 }}>
        <div style={ESTILOS.cabecera}>
          <div style={ESTILOS.emblema} aria-hidden="true">🔥</div>
          <div style={ESTILOS.textosCabecera}>
            <span style={ESTILOS.eyebrow}>ErrorBoundary · Modo Desarrollo</span>
            <h1 style={ESTILOS.titulo}>Error de renderizado atrapado</h1>
          </div>
        </div>

        {/* ── Mensaje de error exacto ── */}
        {error?.message && (
          <div style={ESTILOS.bloqueError}>
            <span style={ESTILOS.bloqueErrorTitulo}>
              {error.name ?? 'Error'} — mensaje exacto
            </span>
            <pre style={ESTILOS.mensajeError}>{error.message}</pre>
          </div>
        )}

        {/* ── Component Stack ── */}
        {componentStack && (
          <div style={ESTILOS.bloqueStack}>
            <span style={ESTILOS.bloqueStackTitulo}>
              Component Stack — dónde falló el árbol de React
            </span>
            <pre style={ESTILOS.stack}>{componentStack.trim()}</pre>
          </div>
        )}

        {/* ── JS Stack completo (colapsado en details para no saturar) ── */}
        {error?.stack && (
          <details style={{ marginBottom: '1.25rem' }}>
            <summary style={{
              cursor: 'pointer',
              fontSize: '0.7rem',
              color: '#3d4455',
              userSelect: 'none',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              padding: '0.25rem 0',
            }}>
              JavaScript Stack trace completo →
            </summary>
            <div style={{ ...ESTILOS.bloqueStack, marginTop: '0.5rem', marginBottom: 0 }}>
              <pre style={{ ...ESTILOS.stack, color: '#3a4a5a' }}>{error.stack}</pre>
            </div>
          </details>
        )}

        {/* ── Pista de acción ── */}
        <div style={ESTILOS.pistaDesarrollo}>
          💡 <strong style={{ color: '#e8a94a' }}>Pista:</strong>{' '}
          El <code style={{ fontFamily: 'monospace' }}>Component Stack</code> muestra
          la cadena exacta de componentes. El error ocurrió en el último componente listado
          antes de <code style={{ fontFamily: 'monospace' }}>ErrorBoundary</code>.
          Revisa también la consola del navegador para el stack de JavaScript completo.
        </div>

        <div style={ESTILOS.acciones}>
          <button
            style={ESTILOS.btnPrimario}
            onClick={onRecargar}
            onMouseOver={(e) => e.currentTarget.style.background = '#c1121f'}
            onMouseOut={(e)  => e.currentTarget.style.background = '#e63946'}
          >
            <IconoRecarga />
            Recargar aplicación
          </button>

          <button
            style={{ ...ESTILOS.btnSecundario, color: '#4caf79', borderColor: 'rgba(76,175,121,0.3)' }}
            onClick={onReintentar}
            onMouseOver={(e) => e.currentTarget.style.borderColor = '#4caf79'}
            onMouseOut={(e)  => e.currentTarget.style.borderColor = 'rgba(76,175,121,0.3)'}
            title="Limpia el estado del boundary e intenta renderizar de nuevo (sin recargar la página)"
          >
            Reintentar sin recargar
          </button>

          <button
            style={ESTILOS.btnSecundario}
            onClick={copiarStack}
            onMouseOver={(e) => e.currentTarget.style.color = '#d8d4cc'}
            onMouseOut={(e)  => e.currentTarget.style.color = '#5a6072'}
            title="Copia el mensaje de error y ambos stacks al portapapeles"
          >
            Copiar stack
          </button>

          <span style={ESTILOS.versionBadge}>DEV · {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  )
}

// ── Clase ErrorBoundary ───────────────────────────────────────────────────────
/**
 * Uso básico:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 * Con props opcionales:
 *   <ErrorBoundary
 *     onError={(error, info) => reportarASentry(error, info)}
 *     fallback={<MiPropiaUI />}
 *   >
 *     <App />
 *   </ErrorBoundary>
 *
 * Props:
 *   children    ReactNode  — árbol a proteger
 *   onError     function   — callback (error, { componentStack }) para Sentry/LogRocket
 *   fallback    ReactNode  — UI personalizada completa (opcional; omite la UI por defecto)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      tieneError:     false,
      error:          null,
      componentStack: null,
    }
    // Binding manual necesario en clases: los métodos de instancia no tienen
    // acceso a `this` automáticamente cuando se pasan como callbacks.
    this.handleRecargar   = this.handleRecargar.bind(this)
    this.handleReintentar = this.handleReintentar.bind(this)
  }

  // ── getDerivedStateFromError ───────────────────────────────────────────────
  // Se llama durante la fase de renderizado, en el mismo ciclo que produjo
  // el error. Debe ser un método estático y puro (sin efectos secundarios).
  // Su única responsabilidad: devolver el nuevo estado para mostrar el fallback.
  static getDerivedStateFromError(error) {
    return {
      tieneError: true,
      error,
    }
  }

  // ── componentDidCatch ──────────────────────────────────────────────────────
  // Se llama en la fase de commit, después del renderizado del fallback.
  // Aquí sí se pueden hacer efectos secundarios: logging, reportes a Sentry, etc.
  componentDidCatch(error, info) {
    // info.componentStack = "\n    at MapaTuristico\n    at App\n    at ErrorBoundary..."
    this.setState({ componentStack: info.componentStack })

    // Log estructurado — siempre, independientemente del entorno
    console.group('🔥 [ErrorBoundary] Error de renderizado capturado')
    console.error('Error:', error)
    console.error('Component Stack:', info.componentStack)
    console.groupEnd()

    // Gancho para integración con servicios externos (Sentry, LogRocket, Datadog)
    // Se pasa como prop para mantener el boundary desacoplado del servicio concreto.
    //
    // Ejemplo de integración con Sentry en main.jsx:
    //   import * as Sentry from '@sentry/react'
    //   <ErrorBoundary onError={(err, info) => Sentry.captureException(err, { extra: info })}>
    //
    if (typeof this.props.onError === 'function') {
      try {
        this.props.onError(error, info)
      } catch (reportError) {
        console.error('[ErrorBoundary] El callback onError también falló:', reportError)
      }
    }
  }

  // ── Recargar la página completa ───────────────────────────────────────────
  // Garantiza un estado limpio: borra memoria JS, recarga assets, reinicializa
  // el Service Worker. Es la acción más segura ante un error desconocido.
  handleRecargar() {
    window.location.reload()
  }

  // ── Reintentar sin recargar (solo desarrollo) ─────────────────────────────
  // Limpia el estado del boundary y vuelve a renderizar los hijos.
  // Útil mientras se corrige el error en caliente con HMR (Vite).
  // En producción no se expone porque puede crear bucles de error.
  handleReintentar() {
    this.setState({
      tieneError:     false,
      error:          null,
      componentStack: null,
    })
  }

  render() {
    const { tieneError, error, componentStack } = this.state
    const { children, fallback } = this.props

    if (!tieneError) {
      // Camino feliz: renderizar los hijos normalmente
      return children
    }

    // ── Fallback completamente personalizado (prop) ──────────────────────────
    if (fallback) {
      return fallback
    }

    // ── Fallback de desarrollo: información técnica completa ─────────────────
    if (ES_DESARROLLO) {
      return (
        <FallbackDesarrollo
          error={error}
          componentStack={componentStack}
          onRecargar={this.handleRecargar}
          onReintentar={this.handleReintentar}
        />
      )
    }

    // ── Fallback de producción: mensaje amigable para el turista ─────────────
    return <FallbackProduccion onRecargar={this.handleRecargar} />
  }
}