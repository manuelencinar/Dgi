'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLatestExchangeRate, formatCurrency } from '@/lib/currency'

// Muestra, en pequeño bajo el precio, el equivalente en la divisa base que el
// usuario ha fijado (user_settings.base_currency), con el tipo de cambio más
// reciente. No renderiza nada si: no hay sesión, la divisa base coincide con la
// del activo, falta el precio o no hay tipo de cambio disponible.
export default function LocalPrice({ price, currency, align = 'right', fontSize = 12 }) {
  const [local, setLocal] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (price == null || isNaN(price) || !currency) return
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data } = await sb.from('user_settings').select('base_currency').eq('user_id', user.id).maybeSingle()
      const base = data?.base_currency || 'EUR'
      if (base === currency) return
      const fx = await getLatestExchangeRate(currency, base)
      if (!fx || !alive) return
      setLocal({ value: price * fx.rate, base, rate: fx.rate })
    })()
    return () => { alive = false }
  }, [price, currency])

  if (!local) return null

  return (
    <p
      title={`1 ${currency} = ${local.rate.toLocaleString('es-ES', { maximumFractionDigits: 4 })} ${local.base}`}
      style={{ fontSize, color: 'var(--text-faint)', marginTop: 2, textAlign: align, cursor: 'help' }}
    >
      ≈ {formatCurrency(local.value, local.base)}
    </p>
  )
}
