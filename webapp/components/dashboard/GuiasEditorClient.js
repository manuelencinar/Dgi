'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'
import GuiaContent from '@/components/GuiaContent'
import { mdToBlocks } from '@/lib/markdown-blocks'

const CATS = ['Fundamentos', 'Fiscalidad', 'Métricas', 'Estrategia']
const EMPTY = { id: null, slug: '', title: '', description: '', category: 'Fundamentos', excerpt: '', content: '', minutes: 6, related: '', published: false }
const inp = { background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
const lbl = { fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block', fontWeight: 600 }

export default function GuiasEditorClient() {
  const [guias, setGuias] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const taRef = useRef(null)

  const load = () => fetch('/api/admin/guias').then(r => r.json()).then(d => setGuias(d.guias || [])).catch(() => setGuias([]))
  useEffect(() => { load() }, [])

  const set = (k, v) => setEdit(e => ({ ...e, [k]: v }))

  const save = async (publishOverride) => {
    if (!edit.title.trim()) { setMsg({ type: 'err', text: 'El título es obligatorio' }); return }
    setBusy(true); setMsg(null)
    const published = publishOverride != null ? publishOverride : edit.published
    const res = await fetch('/api/admin/guias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...edit, published }) })
    const j = await res.json(); setBusy(false)
    if (j.error) { setMsg({ type: 'err', text: j.error }); return }
    setMsg({ type: 'ok', text: published ? '✓ Publicada' : '✓ Guardado (borrador)' })
    if (j.guia) setEdit(e => ({ ...e, id: j.guia.id, slug: j.guia.slug, published: j.guia.published }))
    load()
  }
  const del = async () => {
    if (!edit?.id || !confirm('¿Eliminar esta guía definitivamente?')) return
    await fetch(`/api/admin/guias?id=${edit.id}`, { method: 'DELETE' })
    setEdit(null); load()
  }

  // Inserta/envuelve texto en la posición del cursor del textarea.
  const insert = (before, after = '', placeholder = '') => {
    const ta = taRef.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const sel = edit.content.slice(s, e) || placeholder
    const next = edit.content.slice(0, s) + before + sel + after + edit.content.slice(e)
    set('content', next)
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + before.length + sel.length + after.length }, 0)
  }

  const preview = useMemo(() => edit ? mdToBlocks(edit.content) : [], [edit])

  if (guias == null) return <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Cargando guías…</div>

  // ── Lista ──
  if (!edit) {
    return (
      <div style={{ maxWidth: 900, display: 'grid', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <SectionTitle>Guías (blog SEO)</SectionTitle>
            <button onClick={() => setEdit({ ...EMPTY })} style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>+ Nueva guía</button>
          </div>
          {guias.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '14px 0' }}>Aún no hay guías. Crea la primera.</p>
          ) : (
            <div style={{ display: 'grid', gap: 2 }}>
              {guias.map(g => (
                <button key={g.id} onClick={() => setEdit({ ...g, related: Array.isArray(g.related) ? g.related.join(', ') : (g.related || '') })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', background: 'none', border: 'none', borderBottom: '1px solid var(--surface-2)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: g.published ? 'var(--positive)' : 'var(--warning)', background: (g.published ? 'rgba(52,211,153,0.14)' : 'rgba(251,191,36,0.14)'), padding: '2px 8px', borderRadius: 12, flexShrink: 0 }}>{g.published ? 'PUBLICADA' : 'BORRADOR'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-faint)' }}>{g.category} · /guias/{g.slug}</span>
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>Editar →</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    )
  }

  // ── Editor ──
  const TBtn = ({ onClick, children, title }) => (
    <button type="button" onClick={onClick} title={title} style={{ fontSize: 12, fontWeight: 700, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'pointer' }}>{children}</button>
  )

  return (
    <div style={{ maxWidth: 1200, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <button onClick={() => { setEdit(null); setMsg(null) }} style={{ fontSize: 12.5, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>← Todas las guías</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.type === 'ok' ? 'var(--positive)' : 'var(--negative)' }}>{msg.text}</span>}
          {edit.id && edit.published && <a href={`/guias/${edit.slug}`} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ver ↗</a>}
          {edit.id && <button onClick={del} style={{ fontSize: 12, padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: 'var(--negative)', cursor: 'pointer' }}>Eliminar</button>}
          <button onClick={() => save(false)} disabled={busy} style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer' }}>Guardar borrador</button>
          <button onClick={() => save(true)} disabled={busy} style={{ fontSize: 12.5, fontWeight: 800, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--positive)', color: '#06281c', cursor: 'pointer' }}>{busy ? '…' : (edit.published ? 'Actualizar' : 'Publicar')}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <style>{`@media(min-width:980px){.guia-ed{grid-template-columns:1fr 1fr!important}}`}</style>
        <div className="guia-ed" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          {/* Formulario + markdown */}
          <Card>
            <div style={{ display: 'grid', gap: 11 }}>
              <div>
                <label style={lbl}>Título *</label>
                <input style={inp} value={edit.title} onChange={e => set('title', e.target.value)} placeholder="Cómo tributan los dividendos…" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 90px', gap: 8 }}>
                <div>
                  <label style={lbl}>Slug (URL)</label>
                  <input style={inp} value={edit.slug} onChange={e => set('slug', e.target.value)} placeholder="se-genera-del-titulo" />
                </div>
                <div>
                  <label style={lbl}>Categoría</label>
                  <select style={inp} value={edit.category} onChange={e => set('category', e.target.value)}>{CATS.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div>
                  <label style={lbl}>Minutos</label>
                  <input style={inp} type="number" min="1" max="60" value={edit.minutes} onChange={e => set('minutes', e.target.value)} />
                </div>
              </div>
              <div>
                <label style={lbl}>Descripción (meta SEO)</label>
                <input style={inp} value={edit.description || ''} onChange={e => set('description', e.target.value)} placeholder="Resumen para Google (150-160 caracteres)" />
              </div>
              <div>
                <label style={lbl}>Extracto (tarjeta del índice)</label>
                <input style={inp} value={edit.excerpt || ''} onChange={e => set('excerpt', e.target.value)} placeholder="Frase gancho para la lista de guías" />
              </div>
              <div>
                <label style={lbl}>Relacionadas (slugs separados por coma)</label>
                <input style={inp} value={edit.related || ''} onChange={e => set('related', e.target.value)} placeholder="que-es-dgi, metricas-clave-dgi" />
              </div>
              <div>
                <label style={lbl}>Contenido (Markdown)</label>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                  <TBtn onClick={() => insert('## ', '', 'Título de sección')} title="Encabezado">H2</TBtn>
                  <TBtn onClick={() => insert('**', '**', 'negrita')} title="Negrita">B</TBtn>
                  <TBtn onClick={() => insert('- ', '', 'elemento')} title="Lista">• Lista</TBtn>
                  <TBtn onClick={() => insert('[', '](/screener)', 'texto')} title="Enlace interno">Enlace</TBtn>
                  <TBtn onClick={() => insert('> ', '', 'idea destacada')} title="Nota destacada">❝ Nota</TBtn>
                  <TBtn onClick={() => insert('!cta /screener ', '', 'Abrir el screener')} title="Botón de acción">Botón CTA</TBtn>
                </div>
                <textarea ref={taRef} value={edit.content} onChange={e => set('content', e.target.value)} spellCheck
                  style={{ ...inp, minHeight: 340, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6, resize: 'vertical' }} />
                <p style={{ fontSize: 10.5, color: 'var(--text-faintest)', marginTop: 6, lineHeight: 1.5 }}>
                  <b>##</b> encabezado · <b>- </b>lista · <b>&gt; </b>nota destacada · <b>**texto**</b> negrita · <b>[texto](/ruta)</b> enlace interno · <b>!cta /ruta Texto</b> botón. Los párrafos se separan con una línea en blanco.
                </p>
              </div>
            </div>
          </Card>

          {/* Vista previa en vivo */}
          <Card>
            <SectionTitle>Vista previa</SectionTitle>
            <div style={{ marginTop: 10 }}>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-strong)', lineHeight: 1.25, marginBottom: 16 }}>{edit.title || 'Título de la guía'}</h1>
              {preview.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Empieza a escribir el contenido para ver la vista previa.</p>
                : <GuiaContent content={preview} />}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
