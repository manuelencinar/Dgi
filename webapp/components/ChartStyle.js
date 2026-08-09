'use client'
import { useState, useEffect } from 'react'

// Preferencia de densidad de los gráficos de reparto de la cartera:
//   'donut' → anillo + leyenda de barras (por defecto, el de siempre)
//   'barra' → una sola barra apilada al 100% + leyenda en línea (ocupa ~1/3)
// Se persiste en localStorage igual que el tema (ver ThemeToggle.js): es una
// preferencia de UI, no requiere tocar la base de datos.

const KEY = 'chart-style'
const EVT = 'chartstylechange'

export function readChartStyle() {
  try { return localStorage.getItem(KEY) === 'barra' ? 'barra' : 'donut' } catch { return 'donut' }
}

export function applyChartStyle(style) {
  try { localStorage.setItem(KEY, style) } catch {}
  // Avisa a los demás componentes montados (los gráficos de la misma página)
  // para que cambien sin recargar.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT))
}

// Hook para leer/cambiar el estilo desde cualquier componente cliente.
// `mounted` es false en el primer render (servidor + hidratación): hasta que no
// se lee localStorage no sabemos qué estilo toca, así que quien pinte el gráfico
// debe esperar a montar para no provocar mismatch de hidratación.
export function useChartStyle() {
  const [style, setStyle] = useState('donut')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setStyle(readChartStyle())
    setMounted(true)
    const sync = () => setStyle(readChartStyle())
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)   // otra pestaña
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const set = next => { setStyle(next); applyChartStyle(next) }
  return { style, setStyle: set, compact: style === 'barra', mounted }
}
