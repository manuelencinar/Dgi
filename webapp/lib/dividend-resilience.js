// Resiliencia del dividendo en crisis: usa el histórico anual de dividendo por acción
// (div_history, que llega décadas atrás) para ver si la empresa MANTUVO, SUBIÓ o RECORTÓ
// el dividendo durante las grandes crisis. Señal DGI potentísima. Puro y testeable.
const num = v => (v != null && !isNaN(v)) ? Number(v) : null

// Ventanas de crisis (año de inicio → años a examinar, incl. el previo como base).
const CRISES = [
  { key: '2020', label: 'COVID-19 (2020)', base: 2019, years: [2020, 2021] },
  { key: '2008', label: 'Crisis financiera (2008-09)', base: 2007, years: [2008, 2009, 2010] },
  { key: '2001', label: 'Puntocom (2000-02)', base: 2000, years: [2001, 2002, 2003] },
]

// divHistory: [{ year, dps, isPartial }]. Devuelve un análisis por crisis en la que la
// empresa ya repartía dividendo. outcome: 'raised' | 'held' | 'cut' | null (no aplica).
export function dividendResilience(divHistory) {
  const byYear = {}
  for (const d of (divHistory || [])) {
    if (d && d.year != null && !d.isPartial) {
      const v = num(d.dps)
      if (v != null && v > 0) byYear[d.year] = v
    }
  }
  const years = Object.keys(byYear).map(Number)
  if (!years.length) return { available: false, crises: [] }
  const firstYear = Math.min(...years)

  const crises = []
  for (const c of CRISES) {
    // Solo si la empresa ya repartía dividendo antes de la crisis.
    if (c.base < firstYear) continue
    const baseDps = byYear[c.base]
    if (baseDps == null) continue

    // ¿Hubo algún recorte interanual (>2%) dentro de la ventana?
    let anyCut = false, prev = baseDps, endDps = baseDps
    for (const y of c.years) {
      const dps = byYear[y]
      if (dps == null) continue
      if (dps < prev * 0.98) anyCut = true
      prev = dps
      endDps = dps
    }
    const outcome = anyCut ? 'cut' : (endDps > baseDps * 1.02 ? 'raised' : 'held')
    crises.push({
      key: c.key, label: c.label, outcome,
      baseDps, endDps,
      changePct: baseDps > 0 ? Math.round((endDps - baseDps) / baseDps * 1000) / 10 : null,
    })
  }

  // Resumen: nº de crisis atravesadas sin recorte.
  const survived = crises.filter(c => c.outcome !== 'cut').length
  return { available: crises.length > 0, crises, survived, total: crises.length }
}
