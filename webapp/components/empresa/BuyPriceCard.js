'use client'
// "Precio de compra DGI": el precio al que la empresa entraría en zona de compra (margen de
// seguridad objetivo sobre el valor intrínseco) + gatillo directo a la alerta de watchlist.
import PriceAlertButton from '@/components/watchlist/PriceAlertButton'
import { MOS_TARGET, MIN_QUALITY } from '@/lib/buy-price'

const fmt = (v, cur) => v == null ? '—' : `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur || ''}`.trim()

export default function BuyPriceCard({ model, ticker, name, currency, isAuthed, isPremium }) {
  const b = model
  if (!b || !b.available) {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        {b?.reason === 'calidad_baja'
          ? `Su Score DGI está por debajo de ${MIN_QUALITY}/10: no la marcamos como candidata de compra por precio. Vigila primero la calidad del negocio.`
          : 'Sin una valoración fiable no podemos fijar un precio de compra objetivo para esta empresa.'}
      </p>
    )
  }

  const zoneColor = b.inZone ? 'var(--positive)' : 'var(--text-strong)'
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Precio de compra</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: zoneColor, lineHeight: 1.1 }}>≤ {fmt(b.buyPrice, currency)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>margen de seguridad ≥ {(MOS_TARGET * 100).toFixed(0)}% sobre su valor</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Hoy: {fmt(b.price, currency)}</div>
          {b.inZone
            ? <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--positive)' }}>✓ En zona de compra</div>
            : <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>a un {b.distancePct.toFixed(1)}% por encima</div>}
          {b.currentMos != null && <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>MoS actual {b.currentMos >= 0 ? '+' : ''}{b.currentMos.toFixed(0)}%</div>}
        </div>
      </div>

      {b.yieldTargetPrice != null && (
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
          Referencia por rentabilidad: a <b>{fmt(b.yieldTargetPrice, currency)}</b> su yield volvería a la media histórica.
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        <PriceAlertButton ticker={ticker} name={name} currency={currency} price={b.price} isAuthed={isAuthed} isPremium={isPremium} />
      </div>
    </div>
  )
}
