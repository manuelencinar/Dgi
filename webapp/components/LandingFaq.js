'use client'
import { useState } from 'react'

const ITEMS = [
  {
    q: '¿Qué es el investing DGI?',
    a: 'El Dividend Growth Investing (DGI) es una estrategia que consiste en invertir en empresas que llevan años aumentando su dividendo de forma consecutiva. El objetivo no es maximizar el yield hoy, sino construir una renta creciente y sostenible a largo plazo. Empresas como Coca-Cola, Johnson & Johnson o Nestlé llevan más de 25 años subiendo su dividendo sin interrupciones.',
  },
  {
    q: '¿Qué incluye el plan gratuito?',
    a: 'El plan gratuito incluye acceso permanente a los 43 mercados globales con Score DGI, el termómetro de salud del índice, el yield promedio y el ranking comparativo. En el screener puedes filtrar por yield, zona geográfica y sector. No se requiere tarjeta de crédito.',
  },
  {
    q: '¿Puedo cancelar cuando quiera?',
    a: 'Sí, sin permanencia ni penalización. Puedes cancelar desde el portal de cliente en cualquier momento. No se renueva el siguiente periodo y sigues con acceso premium hasta que finalice el que ya pagaste.',
  },
  {
    q: '¿Con qué frecuencia se actualizan los datos?',
    a: 'Las cotizaciones de los índices se actualizan diariamente. Los fundamentales de las empresas (yield, payout, PE, EPS) se refrescan cada 7 días desde Yahoo Finance. Los Scores DGI se recalculan automáticamente tras cada actualización de fundamentales.',
  },
  {
    q: '¿Para qué tipo de inversor es esta herramienta?',
    a: 'Para inversores particulares que aplican o quieren aprender la estrategia DGI: personas que construyen una cartera de dividendos crecientes, que buscan renta pasiva a largo plazo y que quieren analizar la calidad real de sus empresas más allá del precio. No está pensada para trading ni análisis técnico.',
  },
]

export default function LandingFaq() {
  const [open, setOpen] = useState(null)

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 720, margin: '0 auto' }}>
      {ITEMS.map((item, i) => (
        <div
          key={i}
          style={{
            background: open === i ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${open === i ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 12, overflow: 'hidden', transition: 'border-color .2s',
          }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, padding: '16px 20px', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: '#c8d0e0', lineHeight: 1.4 }}>
              {item.q}
            </span>
            <span style={{
              fontSize: 16, color: '#4a5270', flexShrink: 0,
              transform: open === i ? 'rotate(45deg)' : 'none',
              transition: 'transform .2s',
            }}>+</span>
          </button>
          {open === i && (
            <div style={{ padding: '0 20px 18px', fontSize: 13, color: '#4a5270', lineHeight: 1.75 }}>
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
