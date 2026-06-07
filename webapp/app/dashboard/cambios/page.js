import { Card, PageTitle, SectionTitle } from '@/components/dashboard/ui'

export const dynamic = 'force-dynamic'

// Cambios identificados durante el desarrollo que NO se han podido aplicar por
// completo (faltan datos en BD o requieren recálculos/nuevas fuentes). Se listan
// aquí para tenerlos a la vista e ir implementándolos. Editar este array al cerrar
// o añadir un pendiente.
const PENDING = [
  {
    area: 'Salud financiera',
    type: 'Precisión',
    title: 'Márgenes del semáforo por industria',
    detail: 'El semáforo de Márgenes usa una tabla de umbrales por sector simplificada. La spec pedía los umbrales por industria que ya existen en lib/dgi-score.js (omBreaks).',
    action: 'Exportar omBreaks(industria) desde lib/dgi-score.js y usarlo en lib/health.js mapeando la industria de la empresa.',
  },
  {
    area: 'Salud financiera',
    type: 'Dato faltante',
    title: 'Payout OCF / CFO real (REIT y utilities)',
    detail: 'Las tarjetas “Payout OCF” (REIT) y “Payout CFO” (utilities) muestran la etiqueta correcta, pero el valor usa payout_fcf almacenado, no un payout calculado sobre el flujo operativo.',
    action: 'Calcular Cash Flow Operativo / dividendos pagados desde cashflow_annual (ya existe exCfoDivCoverage en dgi-score) y usar ese valor en esas dos tarjetas.',
  },
  {
    area: 'Salud financiera',
    type: 'Precisión',
    title: 'Energía: medias de 4 años',
    detail: 'En el sector energía/materias primas la spec pedía ROIC y margen operativo como media de 4 ejercicios (suaviza el ciclo). Ahora las tarjetas usan el valor del último ejercicio.',
    action: 'Calcular la media de 4 años de EBIT/Ingresos y de ROIC desde los estados financieros y usarla solo para el sector energía.',
  },
  {
    area: 'Dividendo',
    type: 'Dato faltante',
    title: 'Próximos pagos: fechas reales',
    detail: 'La tabla de próximos pagos es una estimación por frecuencia inferida de la divisa. No guardamos fechas ex-dividendo ni de pago reales.',
    action: 'Añadir una fuente de calendario de dividendos (yfinance dividends/calendar) y guardarla para mostrar fechas e importes oficiales.',
  },
  {
    area: 'Valoración',
    type: 'Dato faltante',
    title: 'Historial de PER más largo',
    detail: 'El PER histórico se reconstruye solo para los ejercicios con fundamentales guardados (≈4 años).',
    action: 'Guardar más años de estados financieros o precalcular una serie de PER anual más larga para ampliar el gráfico.',
  },
  {
    area: 'DICT',
    type: 'Precisión',
    title: 'Overrides del DICT en superficies secundarias',
    detail: 'Ocultar/añadir empresas (tabla dict_overrides) ya aplica en screener, ficha y buscador del comparador. Faltan superficies secundarias que importan el DICT estático en cliente: detector de empresas de la cartera, onboarding, resolución profunda del comparador (lib/comparador) y mercados.',
    action: 'Adoptar getEffectiveDict (o pasar overrides como prop) en lib/comparador, los componentes de cartera/onboarding y las páginas de mercados.',
  },
  {
    area: 'Importación Excel',
    type: 'Precisión',
    title: 'Marcado de celdas manuales y trimestre del vintage',
    detail: 'En la ficha hay un badge de sección "Datos parcialmente manuales", pero no un punto por celda (no se guarda provenencia por celda). El data_vintage trimestral guarda el año más reciente, no el trimestre exacto ("2024Q3"), porque el Excel solo aporta años en la cabecera de cada bloque.',
    action: 'Guardar provenencia por campo/año para marcar celdas concretas y parsear el trimestre del Excel para el vintage trimestral.',
  },
]

const TYPE_COLOR = {
  'Dato faltante': '#fbbf24',
  'Precisión': '#818cf8',
}

export default function CambiosPendientesPage() {
  return (
    <div>
      <PageTitle sub="Mejoras detectadas durante el desarrollo que requieren datos o recálculos adicionales antes de poder aplicarse.">
        Cambios pendientes
      </PageTitle>

      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Resumen</SectionTitle>
        <p style={{ fontSize: 13, color: '#8090a8', lineHeight: 1.6 }}>
          Hay <b style={{ color: '#e0e8f0' }}>{PENDING.length}</b> elementos pendientes. No bloquean el uso de la app — son refinamientos
          de precisión o features que necesitan una fuente de datos que todavía no tenemos.
        </p>
      </Card>

      <div style={{ display: 'grid', gap: 12 }}>
        {PENDING.map((p, i) => {
          const col = TYPE_COLOR[p.type] || '#4a5270'
          return (
            <Card key={i} style={{ borderLeft: `3px solid ${col}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#e0e8f0' }}>{p.title}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4a5270', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 5 }}>{p.area}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}18`, padding: '2px 8px', borderRadius: 5 }}>{p.type}</span>
              </div>
              <p style={{ fontSize: 13, color: '#8090a8', lineHeight: 1.55, marginBottom: 8 }}>{p.detail}</p>
              <p style={{ fontSize: 12, color: '#4a5270', lineHeight: 1.55 }}>
                <span style={{ color: '#34d399', fontWeight: 700 }}>Cómo implementarlo: </span>{p.action}
              </p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
