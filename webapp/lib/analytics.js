// Wrapper de eventos de producto. No-op si PostHog no está cargado (sin key).
// Úsalo para marcar pasos clave del embudo que el autocapture no distingue bien
// (p.ej. inicio de checkout). Los pageviews y clics genéricos ya los captura solo.
export function track(event, props) {
  if (typeof window !== 'undefined' && window.posthog && typeof window.posthog.capture === 'function') {
    try { window.posthog.capture(event, props) } catch {}
  }
}

// Asocia los eventos a la cuenta (para embudos free→premium por usuario).
export function identify(userId, props) {
  if (typeof window !== 'undefined' && window.posthog && typeof window.posthog.identify === 'function') {
    try { window.posthog.identify(userId, props) } catch {}
  }
}
