'use client'

// Sustituye el contenido de este componente con tu código de Google AdSense
// cuando tengas aprobada la cuenta. Por ahora muestra un placeholder.
export default function AdBanner({ slot = "horizontal", className = "" }) {
  const styles = {
    horizontal: { width: "100%", height: 90, maxWidth: 728 },
    square:     { width: "100%", height: 250, maxWidth: 300 },
    rectangle:  { width: "100%", height: 60,  maxWidth: "100%" },
  }
  const s = styles[slot] || styles.horizontal

  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
      <div style={{
        ...s,
        background: "var(--surface)",
        border: "1px dashed var(--border)",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{ fontSize: 10, color: "var(--text-faintest)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Publicidad</span>
      </div>
    </div>
  )
}
