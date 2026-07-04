// Renderiza los bloques de una guía como HTML semántico (h2/p/ul) para SEO.
// Server component. Admite markdown inline mínimo en p/ul: [texto](/url) y **negrita**.

function renderInline(text, kp = '') {
  const out = []
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g
  let last = 0, m, k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] != null) out.push(<a key={kp + k} href={m[2]} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>{m[1]}</a>)
    else out.push(<strong key={kp + k} style={{ color: 'var(--text-strong)' }}>{m[3]}</strong>)
    last = re.lastIndex; k++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function GuiaContent({ content }) {
  return (
    <div>
      {content.map((b, i) => {
        if (b.t === 'h2') return <h2 key={i} style={{ fontSize: 21, fontWeight: 800, color: 'var(--text-strong)', margin: '34px 0 12px', lineHeight: 1.3 }}>{b.c}</h2>
        if (b.t === 'p') return <p key={i} style={{ fontSize: 15.5, color: 'var(--text-muted)', lineHeight: 1.75, margin: '0 0 16px' }}>{renderInline(b.c, `p${i}-`)}</p>
        if (b.t === 'ul') return (
          <ul key={i} style={{ margin: '0 0 18px', paddingLeft: 22, display: 'grid', gap: 8 }}>
            {b.c.map((it, j) => <li key={j} style={{ fontSize: 15.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>{renderInline(it, `l${i}-${j}-`)}</li>)}
          </ul>
        )
        if (b.t === 'callout') return (
          <div key={i} style={{ background: 'rgba(99,102,241,0.07)', borderLeft: '3px solid var(--accent)', borderRadius: '0 10px 10px 0', padding: '13px 16px', margin: '0 0 20px' }}>
            <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{renderInline(b.c, `c${i}-`)}</p>
          </div>
        )
        if (b.t === 'cta') return (
          <div key={i} style={{ margin: '24px 0' }}>
            <a href={b.href} style={{ display: 'inline-block', fontSize: 14, fontWeight: 800, color: '#fff', textDecoration: 'none', padding: '12px 24px', background: 'var(--accent)', borderRadius: 10, boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>{b.label} →</a>
          </div>
        )
        return null
      })}
    </div>
  )
}
