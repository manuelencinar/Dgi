// Convierte Markdown (subset) → bloques que renderiza components/GuiaContent.js.
// Soporta:  ## Título  ·  párrafos (líneas separadas por línea en blanco)  ·
//   - lista  ·  > callout  ·  !cta /ruta Texto del botón
// Inline (lo resuelve GuiaContent): [texto](/url) y **negrita**.
export function mdToBlocks(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let para = [], list = []
  const flushPara = () => { if (para.length) { blocks.push({ t: 'p', c: para.join(' ') }); para = [] } }
  const flushList = () => { if (list.length) { blocks.push({ t: 'ul', c: list.slice() }); list = [] } }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const cta = line.match(/^!cta\s+(\S+)\s+(.+)$/i)
    if (/^##\s+/.test(line)) { flushPara(); flushList(); blocks.push({ t: 'h2', c: line.replace(/^##\s+/, '').trim() }) }
    else if (cta) { flushPara(); flushList(); blocks.push({ t: 'cta', href: cta[1], label: cta[2].trim() }) }
    else if (/^>\s?/.test(line)) { flushPara(); flushList(); blocks.push({ t: 'callout', c: line.replace(/^>\s?/, '').trim() }) }
    else if (/^[-*]\s+/.test(line)) { flushPara(); list.push(line.replace(/^[-*]\s+/, '').trim()) }
    else if (line.trim() === '') { flushPara(); flushList() }
    else { flushList(); para.push(line) }
  }
  flushPara(); flushList()
  return blocks
}

// Bloques → Markdown (para migrar las guías estáticas iniciales a la BD).
export function blocksToMd(content) {
  return (content || []).map(b => {
    if (b.t === 'h2') return `## ${b.c}`
    if (b.t === 'p') return b.c
    if (b.t === 'ul') return b.c.map(i => `- ${i}`).join('\n')
    if (b.t === 'callout') return `> ${b.c}`
    if (b.t === 'cta') return `!cta ${b.href} ${b.label}`
    return ''
  }).join('\n\n')
}
