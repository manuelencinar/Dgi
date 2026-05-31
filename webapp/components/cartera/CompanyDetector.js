'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DICT } from '@/data/dict'
import { getContinent } from '@/lib/helpers'

// Zonas que el screener sabe filtrar
const SCREENER_ZONES = ['América', 'Europa', 'Asia', 'Oceanía']

// ── Gap analysis ───────────────────────────────────────────────────────────

function analyzeGaps(enriched, cagrMap) {
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return []

  // Pesos por sector (usando sector del DICT para casar con el screener)
  const dictSector = t => { const d = DICT.find(x => x[1] === t); return d?.[4] ?? null }
  const sectorW = {}, zoneW = {}, currW = {}
  enriched.forEach(p => {
    const v = p.valueEUR ?? 0
    const sec  = dictSector(p.ticker) || p.sector || 'Otros'
    const zone = getContinent(p.countryCode) || 'Otros'
    const curr = p.currency || 'EUR'
    sectorW[sec]  = (sectorW[sec]  || 0) + v
    zoneW[zone]   = (zoneW[zone]   || 0) + v
    currW[curr]   = (currW[curr]   || 0) + v
  })

  const pct = (map, k) => total > 0 ? (map[k] || 0) / total * 100 : 0
  const maxEntry = map => Object.entries(map).sort((a, b) => b[1] - a[1])[0] || [null, 0]

  // Medias
  const avgYield = enriched.reduce((s, p) => s + (p.currentYield ?? 0), 0) / enriched.length
  const cagrVals = enriched.map(p => cagrMap[p.ticker]).filter(v => v != null)
  const avgCagr  = cagrVals.length ? cagrVals.reduce((a, b) => a + b, 0) / cagrVals.length : null

  const gaps = []

  // 1. Concentración sectorial
  const [topSec, topSecVal] = maxEntry(sectorW)
  if (topSec && topSecVal / total * 100 > 25) {
    // Sugerir un sector infrarrepresentado con muchas oportunidades en el universo
    const sectorCounts = {}
    DICT.forEach(d => { sectorCounts[d[4]] = (sectorCounts[d[4]] || 0) + 1 })
    const underSector = Object.keys(sectorCounts)
      .filter(s => pct(sectorW, s) < 10)
      .sort((a, b) => sectorCounts[b] - sectorCounts[a])[0]
    if (underSector) {
      gaps.push({
        type: 'sector',
        title: `Concentración alta en ${topSec}`,
        explanation: `${topSec} representa el ${(topSecVal / total * 100).toFixed(0)}% de tu cartera. Diversifica añadiendo exposición a ${underSector}.`,
        params: { sector: underSector },
        bannerDesc: `empresas del sector ${underSector} para diversificar`,
      })
    }
  }

  // 2. Concentración por zona
  const [topZone, topZoneVal] = maxEntry(zoneW)
  if (topZone && topZoneVal / total * 100 > 40) {
    const underZone = SCREENER_ZONES
      .filter(z => z !== topZone)
      .sort((a, b) => pct(zoneW, a) - pct(zoneW, b))[0]
    if (underZone) {
      gaps.push({
        type: 'zona',
        title: `Poca exposición fuera de ${topZone}`,
        explanation: `${topZone} concentra el ${(topZoneVal / total * 100).toFixed(0)}% de tu cartera. ${underZone} representa solo el ${pct(zoneW, underZone).toFixed(0)}%.`,
        params: { zona: underZone },
        bannerDesc: `empresas de ${underZone} para equilibrar geográficamente`,
      })
    }
  }

  // 3. Concentración por divisa
  const [topCurr, topCurrVal] = maxEntry(currW)
  if (topCurr && topCurrVal / total * 100 > 55) {
    // Diversificar divisa vía zona con divisa distinta
    const currZone = { EUR: 'América', USD: 'Europa', GBP: 'América', JPY: 'Europa' }[topCurr] || 'América'
    gaps.push({
      type: 'currency',
      title: `Exposición elevada a ${topCurr}`,
      explanation: `El ${(topCurrVal / total * 100).toFixed(0)}% de tu cartera está en ${topCurr}. Considera empresas en otra divisa.`,
      params: { zona: currZone },
      bannerDesc: `empresas en otra divisa distinta de ${topCurr}`,
    })
  }

  // 4. Yield bajo
  if (avgYield < 2.5) {
    gaps.push({
      type: 'yield',
      title: 'Yield medio bajo',
      explanation: `El yield medio de tu cartera es ${avgYield.toFixed(1)}%. Añade empresas con yield superior al 3.5% para aumentar la renta.`,
      params: { yield: '0.035' },
      bannerDesc: 'empresas con yield superior al 3.5%',
    })
  }

  // 5. CAGR bajo
  if (avgCagr != null && avgCagr < 7) {
    gaps.push({
      type: 'cagr',
      title: 'Crecimiento del dividendo bajo',
      explanation: `El CAGR medio del dividendo es ${avgCagr.toFixed(1)}%. Añade empresas con crecimiento superior al 8% para acelerar tu renta futura.`,
      params: { cagr: '8' },
      bannerDesc: 'empresas con CAGR del dividendo superior al 8%',
    })
  }

  return gaps.slice(0, 3)
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CompanyDetector({ enriched, isPremium }) {
  const router = useRouter()
  const [open,    setOpen]    = useState(false)
  const [gaps,    setGaps]    = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)

  const sb = createClient()

  const analyze = async () => {
    setOpen(true)
    if (loaded) return
    setLoading(true)
    const tickers = enriched.map(e => e.ticker)
    const { data: funds } = await sb
      .from('company_fundamentals')
      .select('ticker, div_cagr5')
      .in('ticker', tickers)
    const cagrMap = Object.fromEntries((funds || []).map(f => [f.ticker, f.div_cagr5]))
    setGaps(analyzeGaps(enriched, cagrMap))
    setLoaded(true)
    setLoading(false)
  }

  const goToScreener = (gap) => {
    const params = new URLSearchParams({ ...gap.params, from: 'cartera', hueco: gap.bannerDesc })
    router.push(`/screener?${params.toString()}`)
  }

  if (!isPremium) {
    return (
      <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0', marginBottom: 2 }}>Encuentra empresas que encajan en tu cartera</p>
          <p style={{ fontSize: 12, color: '#4a5270' }}>Análisis automático de huecos y búsqueda personalizada en el screener.</p>
        </div>
        <Link href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '8px 16px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, flexShrink: 0 }}>
          Premium →
        </Link>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {!open ? (
        <button onClick={analyze} style={{
          width: '100%', padding: '12px 18px', background: 'rgba(99,102,241,0.1)',
          border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, cursor: 'pointer',
          color: '#818cf8', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          🔍 Encontrar empresas que encajan
        </button>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Huecos detectados en tu cartera</p>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#4a5270', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>

          {loading ? (
            <p style={{ fontSize: 12, color: '#4a5270' }}>Analizando tu cartera…</p>
          ) : gaps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 14, color: '#34d399', marginBottom: 4 }}>✓ Tu cartera está bien diversificada</p>
              <p style={{ fontSize: 12, color: '#4a5270' }}>No se detectan huecos significativos según los criterios DGI.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {gaps.map((gap, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0', marginBottom: 2 }}>{gap.title}</p>
                    <p style={{ fontSize: 12, color: '#8090a8' }}>{gap.explanation}</p>
                  </div>
                  <button onClick={() => goToScreener(gap)} style={{
                    fontSize: 12, fontWeight: 700, color: '#818cf8', background: 'rgba(99,102,241,0.15)',
                    border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', flexShrink: 0,
                  }}>
                    Buscar empresas →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
