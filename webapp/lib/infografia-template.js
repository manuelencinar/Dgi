// Plantilla HTML/CSS de la infografía (se convierte a PDF con Puppeteer). Separada del
// endpoint y reutilizable. Estilo "hoja de comparación financiera": columnas con color de
// marca por posición + chip de sector, tabla comparativa fila a fila, estrellas de
// dividendo, tabla de puntuación /10 y veredicto derivado solo de datos. Sin logos.
import { buildVerdict, buildSingleVerdict } from '@/lib/infografia-data'

const DISCLAIMER = 'Este documento tiene fines informativos y no constituye asesoramiento financiero ni recomendación de inversión.'

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Estrellas ★ (llenas) / ☆ (vacías) — n de 1..5, null → guion.
function stars(n, color) {
  if (n == null) return '<span class="star-na">—</span>'
  let out = ''
  for (let i = 1; i <= 5; i++) out += `<span class="star" style="color:${i <= n ? color : 'rgba(148,163,184,.35)'}">${i <= n ? '★' : '☆'}</span>`
  return out
}

function scoreColor(v) {
  if (v == null) return '#94a3b8'
  return v >= 8 ? '#34d399' : v >= 6.5 ? '#a3e635' : v >= 5 ? '#fbbf24' : v >= 3.5 ? '#fb923c' : '#f87171'
}

const BASE_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Figtree','Segoe UI',system-ui,sans-serif; color:#0f172a; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:794px; min-height:1123px; margin:0 auto; padding:34px 38px 70px; position:relative; }
  .brandbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
  .brand { font-size:20px; font-weight:800; letter-spacing:-.02em; }
  .brand .dot { color:#818cf8; }
  .subtitle { font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:.12em; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:18px; }
  .col1 { grid-template-columns:1fr; }
  .cardhead { border-radius:14px; padding:16px 18px; color:#fff; position:relative; overflow:hidden; }
  .cardhead .tk { font-size:13px; font-weight:700; opacity:.9; letter-spacing:.04em; }
  .cardhead .nm { font-size:21px; font-weight:800; line-height:1.1; margin-top:2px; }
  .chip { display:inline-block; margin-top:9px; font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; background:rgba(255,255,255,.22); }
  .totbox { position:absolute; top:14px; right:16px; text-align:center; background:rgba(255,255,255,.16); border-radius:10px; padding:6px 10px; }
  .totbox .v { font-size:22px; font-weight:800; line-height:1; }
  .totbox .l { font-size:8.5px; font-weight:700; opacity:.85; letter-spacing:.08em; }
  h2 { font-size:13px; font-weight:800; color:#334155; margin:20px 0 9px; display:flex; align-items:center; gap:7px; }
  h2:before { content:''; width:4px; height:14px; border-radius:2px; background:#818cf8; display:inline-block; }
  table { width:100%; border-collapse:collapse; }
  .cmp td, .cmp th { padding:8px 10px; font-size:12.5px; }
  .cmp thead th { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; text-align:right; font-weight:700; }
  .cmp thead th.lbl { text-align:left; }
  .cmp tbody tr { border-top:1px solid #eef2f7; }
  .cmp .lbl { text-align:left; color:#475569; font-weight:600; }
  .cmp .lbl .ic { margin-right:6px; }
  .cmp .val { text-align:right; font-weight:700; font-variant-numeric:tabular-nums; }
  .stars-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
  .col1 .stars-grid { grid-template-columns:1fr; }
  .starrow { display:flex; align-items:center; justify-content:space-between; padding:7px 12px; background:#f8fafc; border:1px solid #eef2f7; border-radius:9px; }
  .starrow .lab { font-size:11.5px; color:#475569; font-weight:600; }
  .star { font-size:14px; }
  .star-na { color:#94a3b8; }
  .scoretab td { padding:7px 10px; font-size:12.5px; border-top:1px solid #eef2f7; }
  .scoretab .cat { color:#475569; font-weight:600; }
  .scoretab .sc { text-align:right; font-weight:800; font-variant-numeric:tabular-nums; }
  .bar { height:6px; border-radius:3px; background:#eef2f7; overflow:hidden; margin-top:3px; }
  .bar > span { display:block; height:100%; border-radius:3px; }
  .verdict { margin-top:18px; background:#f1f5f9; border:1px solid #e2e8f0; border-left:4px solid #818cf8; border-radius:10px; padding:14px 16px; }
  .verdict h3 { font-size:12.5px; font-weight:800; color:#1e293b; margin-bottom:7px; }
  .verdict p { font-size:11.5px; color:#334155; line-height:1.55; margin-bottom:4px; }
  .footer { position:absolute; bottom:26px; left:38px; right:38px; border-top:1px solid #e2e8f0; padding-top:9px; display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
  .footer .disc { font-size:8.5px; color:#94a3b8; line-height:1.4; max-width:560px; }
  .footer .mk { font-size:9px; color:#64748b; font-weight:700; white-space:nowrap; }
`

function cardHead(m, showTotal = true) {
  return `
  <div class="cardhead" style="background:linear-gradient(135deg,${m.columnColor},${m.columnColor}cc)">
    <div class="tk">${esc(m.ticker)}</div>
    <div class="nm">${esc(m.name)}</div>
    <span class="chip" style="border:1px solid ${m.superColor}">${esc(m.sectorLabel)}</span>
    ${showTotal && m.scores.total != null ? `<div class="totbox"><div class="v">${m.scores.total.toFixed(1)}</div><div class="l">DGI /10</div></div>` : ''}
  </div>`
}

function starRows(m) {
  const c = m.columnColor
  const rows = [
    ['Rentabilidad', m.stars.rentabilidad],
    ['Seguridad', m.stars.seguridad],
    ['Crecimiento histórico', m.stars.crecimiento],
    ['Prob. de seguir subiendo', m.stars.incremento],
  ]
  return rows.map(([lab, n]) => `<div class="starrow"><span class="lab">${lab}</span><span>${stars(n, c)}</span></div>`).join('')
}

function scoreTable(m) {
  const rows = [
    ['Calidad del negocio', m.scores.calidad],
    ['Dividendo', m.scores.dividendo],
    ['Solidez financiera', m.scores.solidez],
    ['Valoración', m.scores.valoracion],
    ['Puntuación DGI final', m.scores.total],
  ]
  return `<table class="scoretab">${rows.map(([cat, v], i) => {
    const col = scoreColor(v)
    const bold = i === rows.length - 1 ? 'font-weight:800' : ''
    return `<tr><td class="cat" style="${bold}">${cat}</td><td class="sc" style="color:${col};${bold}">${v != null ? v.toFixed(1) : '—'}<div class="bar"><span style="width:${v != null ? v * 10 : 0}%;background:${col}"></span></div></td></tr>`
  }).join('')}</table>`
}

const shell = (title, inner, marker) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body><div class="page">
  <div class="brandbar"><div class="brand">Ever<span class="dot">Div</span></div><div class="subtitle">${esc(title)}</div></div>
  ${inner}
  <div class="footer"><div class="disc">${DISCLAIMER}</div><div class="mk">everdiv.com · ${marker}</div></div>
</div></body></html>`

// ── COMPARADOR (2 empresas) ──────────────────────────────────────────────────
export function renderComparadorHtml(models) {
  const [a, b] = models
  const verdict = buildVerdict(models)
  const metricRows = a.metrics.map((row, i) => {
    const bv = b.metrics[i]
    return `<tr><td class="lbl"><span class="ic">${row.icon}</span>${esc(row.label)}</td>
      <td class="val" style="color:${a.columnColor}">${esc(row.value)}</td>
      <td class="val" style="color:${b.columnColor}">${esc(bv ? bv.value : '—')}</td></tr>`
  }).join('')

  const inner = `
    <div class="cols">${cardHead(a)}${cardHead(b)}</div>

    <h2>Comparativa financiera</h2>
    <table class="cmp">
      <thead><tr><th class="lbl">Métrica</th><th>${esc(a.ticker)}</th><th>${esc(b.ticker)}</th></tr></thead>
      <tbody>${metricRows}</tbody>
    </table>

    <h2>Dividendo de un vistazo</h2>
    <div class="cols">
      <div><div style="font-size:11px;font-weight:800;color:${a.columnColor};margin-bottom:6px">${esc(a.ticker)}</div><div class="stars-grid" style="grid-template-columns:1fr">${starRows(a)}</div></div>
      <div><div style="font-size:11px;font-weight:800;color:${b.columnColor};margin-bottom:6px">${esc(b.ticker)}</div><div class="stars-grid" style="grid-template-columns:1fr">${starRows(b)}</div></div>
    </div>

    <h2>Puntuación sobre 10</h2>
    <div class="cols"><div>${scoreTable(a)}</div><div>${scoreTable(b)}</div></div>

    ${verdict ? `<div class="verdict"><h3>¿Cuál compraría hoy?</h3>${verdict.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
  `
  return shell('Comparativa DGI', inner, `${a.ticker} vs ${b.ticker}`)
}

// ── FICHA (1 empresa) ─────────────────────────────────────────────────────────
export function renderEmpresaHtml(m) {
  const verdict = buildSingleVerdict(m)
  const metricRows = m.metrics.map(row =>
    `<tr><td class="lbl"><span class="ic">${row.icon}</span>${esc(row.label)}</td><td class="val" style="color:${m.columnColor}">${esc(row.value)}</td></tr>`
  ).join('')

  const inner = `
    <div class="cols col1">${cardHead(m)}</div>

    <h2>Métricas clave</h2>
    <table class="cmp">
      <thead><tr><th class="lbl">Métrica</th><th>${esc(m.ticker)}</th></tr></thead>
      <tbody>${metricRows}</tbody>
    </table>

    <h2>Dividendo de un vistazo</h2>
    <div class="stars-grid">${starRows(m)}</div>

    <h2>Puntuación sobre 10</h2>
    ${scoreTable(m)}

    ${verdict ? `<div class="verdict"><h3>Resumen</h3>${verdict.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
  `
  return shell('Análisis DGI', inner, m.ticker)
}
