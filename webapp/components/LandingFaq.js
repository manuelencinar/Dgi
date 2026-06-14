'use client'
import { useState } from 'react'

const ITEMS = [
  {
    q: '¿Qué es el investing DGI?',
    a: 'El Dividend Growth Investing (DGI) es una estrategia que consiste en invertir en empresas que llevan años aumentando su dividendo de forma consecutiva. El objetivo no es maximizar el yield hoy, sino construir una renta creciente y sostenible a largo plazo. Empresas como Coca-Cola, Johnson & Johnson o Nestlé llevan más de 25 años subiendo su dividendo sin interrupciones.',
  },
  {
    q: '¿Cómo se calcula el Score DGI?',
    a: 'Es una nota de 0 a 10, ponderada según el sector de cada empresa, que combina cuatro dimensiones: calidad del negocio (ROIC/ROE, márgenes, crecimiento), dividendo (yield, racha de años subiéndolo, CAGR y payout sostenible), solidez financiera (deuda, cobertura de intereses, FCF) y valoración (margen de seguridad frente al valor intrínseco). Se le restan penalizaciones por riesgos (recortes, payout insostenible, deterioro) y se suman bonificaciones por tendencias positivas sostenidas. Verde ≥6,5 · amarillo 5–6,5 · rojo <5.',
  },
  {
    q: '¿Los datos son en tiempo real?',
    a: 'No, y a propósito: el DGI es inversión a largo plazo, no trading. Las cotizaciones se actualizan dos veces al día (cierre de Europa y cierre de EEUU) y los fundamentales (yield, payout, ROIC, deuda, estados financieros) se refrescan semanalmente desde Yahoo Finance. Los Scores DGI se recalculan tras cada actualización.',
  },
  {
    q: '¿En qué se diferencia de Simply Safe Dividends o Dividend.com?',
    a: 'Tres cosas: (1) cobertura realmente global — 43 mercados y casi 2.000 empresas de más de 30 países, no solo EEUU; (2) un Score DGI ponderado por sector (un banco, un REIT y una tecnológica no se miden igual) con valoración por valor intrínseco incluida; y (3) en español, con la fiscalidad de dividendos (retenciones en origen y destino) integrada en los cálculos de renta neta. Además el plan gratuito es permanente y sin tarjeta.',
  },
  {
    q: '¿Funciona si invierto desde España con ING, DEGIRO o Interactive Brokers?',
    a: 'Sí. La herramienta es de análisis, independiente de tu bróker: te ayuda a decidir qué comprar y a qué precio, y tú ejecutas en el bróker que uses (ING, MyInvestor, DEGIRO, Interactive Brokers, etc.). Puedes registrar tus posiciones manualmente en la cartera y los cálculos de renta neta tienen en cuenta las retenciones según tu residencia fiscal.',
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
