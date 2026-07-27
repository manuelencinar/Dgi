// Plantilla HTML/CSS de la infografía (se convierte a PDF con Puppeteer). Separada del
// endpoint y reutilizable. Estilo "hoja de comparación financiera" (horizontal, 3 columnas):
// empresa A a la izquierda + tabla financiera central + empresa B a la derecha, cada una
// con su color de marca. Secciones Negocio / Fortalezas / Riesgos / Próximos resultados,
// estrellas de dividendo, tabla de puntuación /10 y veredicto. Sin logos.
import { buildVerdict, buildSingleVerdict, buildCommonNotes } from '@/lib/infografia-data'

const DISCLAIMER = 'Este documento tiene fines informativos y no constituye asesoramiento financiero ni recomendación de inversión.'

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function hoyLargo() {
  const d = new Date()
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

// Estrellas ★ / ☆ — n de 1..5.
function stars(n, color) {
  if (n == null) return '<span class="star-na">—</span>'
  let out = ''
  for (let i = 1; i <= 5; i++) out += `<span class="star" style="color:${i <= n ? color : '#d7deea'}">${i <= n ? '★' : '☆'}</span>`
  return out
}
function scoreColor(v) {
  if (v == null) return '#94a3b8'
  return v >= 8 ? '#16a34a' : v >= 6.5 ? '#65a30d' : v >= 5 ? '#d97706' : v >= 3.5 ? '#ea580c' : '#dc2626'
}
function moatLabel(m) { return m === 'wide' ? 'Ventaja amplia' : m === 'narrow' ? 'Ventaja presente' : 'Sin foso claro' }

const CSS = `
  @page { size: A4 landscape; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Figtree','Segoe UI',system-ui,sans-serif; color:#1e293b; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:1123px; min-height:794px; margin:0 auto; padding:22px 26px 54px; position:relative; }
  /* Cabecera */
  .hero { display:grid; grid-template-columns:1fr 2fr 1fr; align-items:center; border-bottom:2px solid #e5e9f0; padding-bottom:12px; margin-bottom:14px; }
  .hero .side { font-size:19px; font-weight:900; letter-spacing:-.01em; }
  .hero .side.r { text-align:right; }
  .hero .mid { text-align:center; }
  .hero .mid .t { font-size:23px; font-weight:900; letter-spacing:-.02em; line-height:1.05; }
  .hero .mid .t .vs { color:#94a3b8; font-weight:800; margin:0 8px; }
  .hero .mid .s { font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.14em; margin-top:4px; }
  .hero .mid .d { font-size:9.5px; color:#94a3b8; margin-top:3px; }
  .brandmark { font-size:12px; font-weight:800; color:#818cf8; }
  /* Rejilla principal 3 columnas */
  .grid3 { display:grid; grid-template-columns:1fr 1.15fr 1fr; gap:16px; }
  /* Columnas laterales */
  .side-col .sec { margin-bottom:11px; }
  .side-col .sec .h { display:flex; align-items:center; gap:7px; font-size:10.5px; font-weight:900; text-transform:uppercase; letter-spacing:.06em; margin-bottom:5px; }
  .side-col .sec .h .ic { width:19px; height:19px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:11px; color:#fff; flex:0 0 auto; }
  .side-col .sec p { font-size:10.5px; line-height:1.5; color:#334155; }
  .side-col .sec ul { list-style:none; }
  .side-col .sec li { font-size:10px; line-height:1.42; color:#334155; padding-left:13px; position:relative; margin-bottom:3px; }
  .side-col .sec li:before { content:''; position:absolute; left:2px; top:5px; width:5px; height:5px; border-radius:50%; background:#94a3b8; }
  .side-col .sec ul.pos-list li:before { background:#16a34a; }
  .side-col .sec ul.neg-list li:before { background:#f59e0b; }
  .side-head { border-radius:12px; padding:11px 13px; color:#fff; margin-bottom:12px; }
  .side-head .tk { font-size:11px; font-weight:800; opacity:.85; letter-spacing:.05em; }
  .side-head .nm { font-size:18px; font-weight:900; line-height:1.08; margin-top:1px; }
  .side-head .meta { font-size:9.5px; opacity:.9; margin-top:5px; font-weight:600; }
  .side-head .chip { display:inline-block; margin-top:7px; font-size:9px; font-weight:800; padding:2px 8px; border-radius:999px; background:rgba(255,255,255,.22); }
  /* Columna central */
  .center .block { border:1px solid #e5e9f0; border-radius:12px; overflow:hidden; margin-bottom:12px; }
  .center .block .title { font-size:11px; font-weight:900; text-align:center; text-transform:uppercase; letter-spacing:.08em; color:#334155; padding:8px; background:#f6f8fb; border-bottom:1px solid #e5e9f0; }
  table { width:100%; border-collapse:collapse; }
  .cmp .colh { display:grid; grid-template-columns:1.35fr 1fr 1fr; }
  .cmp .colh span { text-align:center; font-size:10px; font-weight:900; color:#fff; padding:5px 4px; }
  .cmp .row { display:grid; grid-template-columns:1.35fr 1fr 1fr; align-items:center; border-top:1px solid #eef2f7; }
  .cmp .row:nth-child(even) { background:#fbfcfe; }
  .cmp .lbl { font-size:9.7px; color:#475569; font-weight:700; padding:6px 8px; display:flex; align-items:center; gap:5px; }
  .cmp .lbl .ic { font-size:11px; }
  .cmp .v { text-align:center; font-size:11.5px; font-weight:800; font-variant-numeric:tabular-nums; padding:6px 4px; }
  .qual { display:grid; grid-template-columns:1fr 1fr; }
  .qual .c { text-align:center; padding:9px 6px; }
  .qual .c.b { border-left:1px solid #eef2f7; }
  .qual .c .n { font-size:17px; font-weight:900; }
  .qual .c .st { font-size:12px; margin-top:2px; }
  .qual .c .lb { font-size:8.5px; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-top:2px; }
  .summary { padding:9px 12px; }
  .summary li { list-style:none; font-size:10px; color:#334155; line-height:1.4; padding-left:17px; position:relative; margin-bottom:4px; }
  .summary li:before { content:'✓'; position:absolute; left:0; top:0; color:#16a34a; font-weight:900; }
  /* Franja inferior */
  .bottom { display:grid; grid-template-columns:1fr 1.1fr 1fr; gap:16px; margin-top:2px; }
  .panel { border:1px solid #e5e9f0; border-radius:12px; overflow:hidden; }
  .panel .title { font-size:10.5px; font-weight:900; text-transform:uppercase; letter-spacing:.07em; color:#334155; padding:8px 10px; background:#f6f8fb; border-bottom:1px solid #e5e9f0; text-align:center; }
  .scoretab { width:100%; }
  .scoretab .hr { display:grid; grid-template-columns:1.4fr 1fr 1fr; }
  .scoretab .hr span { text-align:center; font-size:9px; font-weight:900; color:#fff; padding:4px; }
  .scoretab .rw { display:grid; grid-template-columns:1.4fr 1fr 1fr; align-items:center; border-top:1px solid #eef2f7; }
  .scoretab .rw.tot { background:#f6f8fb; font-weight:900; }
  .scoretab .cat { font-size:9.5px; color:#475569; font-weight:700; padding:5px 9px; }
  .scoretab .sc { text-align:center; font-size:11px; font-weight:800; padding:5px; font-variant-numeric:tabular-nums; }
  .scoretab .sc.win { position:relative; }
  .verdict { padding:11px 13px; text-align:center; }
  .verdict .trophy { font-size:22px; }
  .verdict .win { font-size:14px; font-weight:900; margin:3px 0 6px; }
  .verdict p { font-size:9.7px; color:#334155; line-height:1.45; margin-bottom:4px; text-align:left; }
  .divstars { padding:9px 11px; }
  .divstars .r { display:grid; grid-template-columns:1.2fr 1fr 1fr; align-items:center; padding:4px 0; border-top:1px solid #eef2f7; }
  .divstars .r:first-child { border-top:none; }
  .divstars .lab { font-size:9.3px; color:#475569; font-weight:700; }
  .divstars .st { text-align:center; font-size:11px; }
  .divstars .hd { display:grid; grid-template-columns:1.2fr 1fr 1fr; padding-bottom:3px; }
  .divstars .hd span { text-align:center; font-size:9px; font-weight:900; }
  .footer { position:absolute; bottom:16px; left:26px; right:26px; border-top:1px solid #e5e9f0; padding-top:7px; display:flex; justify-content:space-between; gap:16px; }
  .footer .disc { font-size:8px; color:#94a3b8; line-height:1.35; max-width:640px; }
  .footer .mk { font-size:8.5px; color:#64748b; font-weight:800; white-space:nowrap; }
`

// Cabecera de columna lateral (nombre + sector + capitalización).
function sideHead(m) {
  return `<div class="side-head" style="background:linear-gradient(135deg,${m.columnColor},${m.columnColor}cc)">
    <div class="tk">${esc(m.ticker)}</div>
    <div class="nm">${esc(m.name)}</div>
    <div class="meta">${esc(m.sectorLabel)}${m.marketCap ? ` · Cap. ${esc(m.marketCap)} ${esc(m.currency)}` : ''}</div>
    <span class="chip">${moatLabel(m.moat)}</span>
  </div>`
}

// Secciones cualitativas de una columna lateral.
function sideSections(m) {
  const col = m.columnColor
  const icon = t => `<span class="ic" style="background:${col}">${t}</span>`
  return `
    ${m.profile ? `<div class="sec"><div class="h" style="color:${col}">${icon('🏢')} Negocio</div><p>${esc(m.profile)}</p></div>` : ''}
    <div class="sec"><div class="h" style="color:${col}">${icon('✓')} Fortalezas</div>
      <ul class="pos-list">${m.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
    <div class="sec"><div class="h" style="color:${col}">${icon('!')} Riesgos</div>
      <ul class="neg-list">${m.risks.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
    ${(m.nextEarnings || m.lastReport) ? `<div class="sec"><div class="h" style="color:${col}">${icon('📅')} Resultados</div>
      <p>${m.lastReport ? `Últimos: <b>${esc(m.lastReport)}</b>` : ''}${m.lastReport && m.nextEarnings ? ' · ' : ''}${m.nextEarnings ? `Próximos: <b>${esc(m.nextEarnings)}</b>` : ''}</p></div>` : ''}
  `
}

function sideCol(m, sideClass) {
  return `<div class="side-col ${sideClass}">${sideHead(m)}${sideSections(m)}</div>`
}

// ── COMPARADOR (2 empresas) ──────────────────────────────────────────────────
export function renderComparadorHtml(models) {
  const [a, b] = models
  const verdict = buildVerdict(models)
  const notes = buildCommonNotes(models)

  const finRows = a.metrics.map((row, i) => {
    const bv = b.metrics[i]
    return `<div class="row">
      <div class="lbl"><span class="ic">${row.icon}</span>${esc(row.label)}</div>
      <div class="v" style="color:${a.columnColor}">${esc(row.value)}</div>
      <div class="v" style="color:${b.columnColor}">${esc(bv ? bv.value : '—')}</div>
    </div>`
  }).join('')

  const scoreRows = [
    ['Calidad del negocio', a.scores.calidad, b.scores.calidad],
    ['Dividendo', a.scores.dividendo, b.scores.dividendo],
    ['Solidez financiera', a.scores.solidez, b.scores.solidez],
    ['Valoración', a.scores.valoracion, b.scores.valoracion],
    ['Puntuación DGI final', a.scores.total, b.scores.total],
  ].map(([cat, va, vb], i) => {
    const tot = i === 4
    const wa = va != null && vb != null && va >= vb, wb = vb != null && va != null && vb >= va
    return `<div class="rw${tot ? ' tot' : ''}">
      <div class="cat">${cat}</div>
      <div class="sc" style="color:${scoreColor(va)};${wa ? 'font-weight:900' : ''}">${va != null ? va.toFixed(1) : '—'}</div>
      <div class="sc" style="color:${scoreColor(vb)};${wb ? 'font-weight:900' : ''}">${vb != null ? vb.toFixed(1) : '—'}</div>
    </div>`
  }).join('')

  const divStarRows = [
    ['Rentabilidad', 'rentabilidad'],
    ['Seguridad', 'seguridad'],
    ['Crecimiento histórico', 'crecimiento'],
    ['Prob. de seguir subiendo', 'incremento'],
  ].map(([lab, k]) => `<div class="r"><div class="lab">${lab}</div>
      <div class="st">${stars(a.stars[k], a.columnColor)}</div>
      <div class="st">${stars(b.stars[k], b.columnColor)}</div></div>`).join('')

  const inner = `
    <div class="hero">
      <div class="side" style="color:${a.columnColor}">${esc(a.name)}</div>
      <div class="mid">
        <div class="t">${esc(a.name)}<span class="vs">vs</span>${esc(b.name)}</div>
        <div class="s">Comparativa DGI · ${esc(hoyLargo())}</div>
        <div class="d">Datos verificados a fecha actual</div>
      </div>
      <div class="side r" style="color:${b.columnColor}">${esc(b.name)}</div>
    </div>

    <div class="grid3">
      ${sideCol(a, 'left')}

      <div class="center">
        <div class="block cmp">
          <div class="colh"><span style="background:#64748b">Métrica</span><span style="background:${a.columnColor}">${esc(a.ticker)}</span><span style="background:${b.columnColor}">${esc(b.ticker)}</span></div>
          ${finRows}
        </div>
        <div class="block">
          <div class="title">Calidad del negocio</div>
          <div class="qual">
            <div class="c"><div class="n" style="color:${a.columnColor}">${a.scores.calidad != null ? a.scores.calidad.toFixed(1) : '—'}<span style="font-size:10px;color:#94a3b8">/10</span></div><div class="st">${stars(a.scores.calidad != null ? Math.round(a.scores.calidad / 2) : null, a.columnColor)}</div><div class="lb">${esc(a.ticker)}</div></div>
            <div class="c b"><div class="n" style="color:${b.columnColor}">${b.scores.calidad != null ? b.scores.calidad.toFixed(1) : '—'}<span style="font-size:10px;color:#94a3b8">/10</span></div><div class="st">${stars(b.scores.calidad != null ? Math.round(b.scores.calidad / 2) : null, b.columnColor)}</div><div class="lb">${esc(b.ticker)}</div></div>
          </div>
        </div>
        ${notes.length ? `<div class="block"><div class="title">Resumen rápido</div><ul class="summary">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
      </div>

      ${sideCol(b, 'right')}
    </div>

    <div class="bottom">
      <div class="panel">
        <div class="title">Puntuación final (sobre 10)</div>
        <div class="scoretab">
          <div class="hr"><span style="background:#64748b"> </span><span style="background:${a.columnColor}">${esc(a.ticker)}</span><span style="background:${b.columnColor}">${esc(b.ticker)}</span></div>
          ${scoreRows}
        </div>
      </div>
      <div class="panel">
        <div class="title">¿Cuál compraría hoy?</div>
        <div class="verdict">
          <div class="trophy">🏆</div>
          ${verdict ? `<div class="win" style="color:${(verdict.winner === a.name ? a : b).columnColor}">${esc(verdict.winner)}</div>${verdict.lines.map(l => `<p>${esc(l)}</p>`).join('')}` : ''}
        </div>
      </div>
      <div class="panel">
        <div class="title">Dividendos</div>
        <div class="divstars">
          <div class="hd"><span></span><span style="color:${a.columnColor}">${esc(a.ticker)}</span><span style="color:${b.columnColor}">${esc(b.ticker)}</span></div>
          ${divStarRows}
        </div>
      </div>
    </div>
  `
  return shell(inner, `${a.ticker} vs ${b.ticker}`)
}

function shell(inner, marker) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="page">
  ${inner}
  <div class="footer"><div class="disc">${DISCLAIMER}</div><div class="mk">everdiv.com · ${esc(marker)}</div></div>
</div></body></html>`
}

// ── FICHA (1 empresa) — variante vertical de una sola columna ─────────────────
const CSS_PORTRAIT = CSS.replace('size: A4 landscape', 'size: A4 portrait')
  .replace('width:1123px; min-height:794px', 'width:794px; min-height:1123px')

export function renderEmpresaHtml(m) {
  const verdict = buildSingleVerdict(m)
  const col = m.columnColor
  const icon = t => `<span class="ic" style="background:${col}">${t}</span>`

  const finRows = m.metrics.map(row => `<div class="row" style="grid-template-columns:1.6fr 1fr">
    <div class="lbl"><span class="ic">${row.icon}</span>${esc(row.label)}</div>
    <div class="v" style="color:${col}">${esc(row.value)}</div></div>`).join('')

  const scoreRows = [
    ['Calidad del negocio', m.scores.calidad],
    ['Dividendo', m.scores.dividendo],
    ['Solidez financiera', m.scores.solidez],
    ['Valoración', m.scores.valoracion],
    ['Puntuación DGI final', m.scores.total],
  ].map(([cat, v], i) => `<div class="rw${i === 4 ? ' tot' : ''}" style="grid-template-columns:1.6fr 1fr">
    <div class="cat">${cat}</div><div class="sc" style="color:${scoreColor(v)}">${v != null ? v.toFixed(1) : '—'}</div></div>`).join('')

  const divStarRows = [
    ['Rentabilidad', 'rentabilidad'], ['Seguridad', 'seguridad'],
    ['Crecimiento histórico', 'crecimiento'], ['Prob. de seguir subiendo', 'incremento'],
  ].map(([lab, k]) => `<div class="r" style="grid-template-columns:1.4fr 1fr"><div class="lab">${lab}</div><div class="st">${stars(m.stars[k], col)}</div></div>`).join('')

  const inner = `
    <div class="hero" style="grid-template-columns:1fr">
      <div class="mid">
        <div class="t">${esc(m.name)}</div>
        <div class="s">Análisis DGI · ${esc(m.ticker)} · ${esc(hoyLargo())}</div>
        <div class="d">${esc(m.sectorLabel)}${m.marketCap ? ` · Cap. ${esc(m.marketCap)} ${esc(m.currency)}` : ''} · ${moatLabel(m.moat)}</div>
      </div>
    </div>

    <div class="grid3" style="grid-template-columns:1fr 1fr; gap:16px">
      <div class="side-col left">
        <div class="side-head" style="background:linear-gradient(135deg,${col},${col}cc)">
          <div class="tk">${esc(m.ticker)} · Puntuación DGI</div>
          <div class="nm">${m.scores.total != null ? m.scores.total.toFixed(1) + ' / 10' : '—'}</div>
        </div>
        ${sideSections(m)}
      </div>
      <div class="center">
        <div class="block cmp">
          <div class="colh" style="grid-template-columns:1.6fr 1fr"><span style="background:#64748b">Métrica</span><span style="background:${col}">${esc(m.ticker)}</span></div>
          ${finRows}
        </div>
        <div class="block">
          <div class="title">Dividendo de un vistazo</div>
          <div class="divstars">${divStarRows}</div>
        </div>
      </div>
    </div>

    <div class="bottom" style="grid-template-columns:1fr 1fr">
      <div class="panel">
        <div class="title">Puntuación (sobre 10)</div>
        <div class="scoretab">${scoreRows}</div>
      </div>
      <div class="panel">
        <div class="title">Resumen</div>
        <div class="verdict" style="text-align:left">${verdict ? verdict.lines.map(l => `<p>${esc(l)}</p>`).join('') : ''}</div>
      </div>
    </div>
  `
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS_PORTRAIT}</style></head><body><div class="page">
    ${inner}
    <div class="footer"><div class="disc">${DISCLAIMER}</div><div class="mk">everdiv.com · ${esc(m.ticker)}</div></div>
  </div></body></html>`
}
