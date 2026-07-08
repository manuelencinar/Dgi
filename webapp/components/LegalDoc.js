import PublicNav from '@/components/PublicNav'

// Renderizador de documentos legales a partir de una estructura de secciones.
// Cada sección: { h: 'Título', body: [ 'párrafo', { list: ['item', ...] }, ... ] }
export default function LegalDoc({ title, updated, intro, sections = [] }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '44px 20px 80px' }}>
        <h1 style={{ fontSize: 'clamp(26px, 4.5vw, 34px)', fontWeight: 900, color: 'var(--text-strong)', marginBottom: 8, lineHeight: 1.15 }}>{title}</h1>
        {updated && <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 22 }}>Última actualización: {updated}</p>}
        {intro && <p style={{ fontSize: 14.5, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 26 }}>{intro}</p>}

        {sections.map((s, i) => (
          <section key={i} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 10 }}>{i + 1}. {s.h}</h2>
            {s.body.map((b, j) => {
              if (typeof b === 'string') {
                return <p key={j} style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 10 }} dangerouslySetInnerHTML={{ __html: b }} />
              }
              if (b.list) {
                return (
                  <ul key={j} style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                    {b.list.map((li, k) => (
                      <li key={k} style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: li }} />
                    ))}
                  </ul>
                )
              }
              return null
            })}
          </section>
        ))}

        <p style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.6, marginTop: 36, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          Para cualquier duda sobre este documento puedes escribirnos a <a href="mailto:soporte@everdiv.com" style={{ color: 'var(--accent)' }}>soporte@everdiv.com</a>.
        </p>
      </div>
    </div>
  )
}
