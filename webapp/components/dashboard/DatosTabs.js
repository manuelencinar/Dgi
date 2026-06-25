'use client'
import { useState } from 'react'
import { Card, PageTitle, SectionTitle, StatusDot, fmtDateTime } from '@/components/dashboard/ui'
import EmpresasAdminClient from './EmpresasAdminClient'
import EtfsAdminClient from './EtfsAdminClient'
import MarketsAdminClient from './MarketsAdminClient'
import ImportExcelClient from './ImportExcelClient'
import DictManagerClient from './DictManagerClient'
import SectorAssignClient from './SectorAssignClient'
import BankMetricsClient from './BankMetricsClient'
import InsurerMetricsClient from './InsurerMetricsClient'
import ReitMetricsClient from './ReitMetricsClient'

const TABS = [
  ['empresas', 'Empresas'], ['sectores', 'Sectores'], ['banca', 'Banca'], ['seguros', 'Seguros'], ['reits', 'REITs'], ['funds', 'ETFs y Fondos'], ['indices', 'Índices'],
  ['importar', 'Importar Excel'], ['logs', 'Logs'],
]

function LogsView({ logs }) {
  return (
    <Card>
      <SectionTitle>Últimos eventos ({logs?.length || 0})</SectionTitle>
      <div style={{ display: 'grid', gap: 1 }}>
        {(logs || []).map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--surface-2)', fontSize: 12 }}>
            <StatusDot status={l.status} />
            <span style={{ flex: 1, color: 'var(--text)' }}>{l.description || l.event_type}</span>
            <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>{l.event_type}</span>
            <span style={{ color: 'var(--text-faint)', fontSize: 10, whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</span>
          </div>
        ))}
        {!logs?.length && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin eventos registrados.</p>}
      </div>
    </Card>
  )
}

export default function DatosTabs({ companies, sectors, countries, funds, markets, logs }) {
  const [tab, setTab] = useState('empresas')
  return (
    <div style={{ maxWidth: 1100 }}>
      <PageTitle sub="Gestión de empresas, ETFs/fondos, índices y carga de datos">Datos</PageTitle>

      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--surface-3)', marginBottom: 16 }}>
        {TABS.map(([id, label]) => {
          const active = id === tab
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px',
              fontSize: 13, fontWeight: 700, color: active ? '#fff' : 'var(--text-faint)',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', whiteSpace: 'nowrap',
            }}>{label}</button>
          )
        })}
      </div>

      {tab === 'empresas' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <EmpresasAdminClient companies={companies} sectors={sectors} countries={countries} />
          <DictManagerClient />
        </div>
      )}
      {tab === 'sectores' && <SectorAssignClient />}
      {tab === 'banca' && <BankMetricsClient />}
      {tab === 'seguros' && <InsurerMetricsClient />}
      {tab === 'reits' && <ReitMetricsClient />}
      {tab === 'funds' && <EtfsAdminClient funds={funds} />}
      {tab === 'indices' && <MarketsAdminClient markets={markets} />}
      {tab === 'importar' && <ImportExcelClient />}
      {tab === 'logs' && <LogsView logs={logs} />}
    </div>
  )
}
