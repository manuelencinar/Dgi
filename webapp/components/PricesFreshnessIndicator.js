'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PricesFreshnessIndicator() {
  const [info, setInfo] = useState(null)
  const sb = createClient()

  useEffect(() => {
    sb.from('daily_prices')
      .select('date, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setInfo(data) })
  }, [])

  if (!info) return null

  const priceDate  = info.date
  const updatedAt  = new Date(info.updated_at)
  const today      = new Date().toISOString().slice(0, 10)
  const ageInDays  = Math.floor((new Date(today) - new Date(priceDate)) / 86400000)

  let color, text
  if (ageInDays === 0) {
    color = 'var(--positive)'
    const h = updatedAt.getHours().toString().padStart(2, '0')
    const m = updatedAt.getMinutes().toString().padStart(2, '0')
    text  = `Precios actualizados hoy ${h}:${m}`
  } else if (ageInDays === 1) {
    color = 'var(--warning)'
    text  = `Precios de cierre del ${new Date(priceDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
  } else {
    color = 'var(--negative)'
    text  = 'Precios desactualizados'
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-faint)' }}>
      <span style={{ color, fontSize: 8 }}>●</span>
      <span style={{ color }}>{text}</span>
    </div>
  )
}
