import { serviceClient } from '@/lib/admin'
import SistemaClient from '@/components/dashboard/SistemaClient'

export const dynamic = 'force-dynamic'

function nextSunday6UTC() {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 0, 0))
  const day = d.getUTCDay()
  let add = (7 - day) % 7
  if (add === 0 && now.getUTCHours() >= 6) add = 7
  d.setUTCDate(d.getUTCDate() + add)
  return d.toISOString()
}

export default async function SistemaPage() {
  const sc = serviceClient()

  // Ping a Supabase
  let pingMs = null, pingOk = false
  try {
    const t0 = Date.now()
    const { error } = await sc.from('company_fundamentals').select('ticker', { count: 'exact', head: true })
    pingMs = Date.now() - t0
    pingOk = !error
  } catch {}

  // Último run + logs
  let lastRun = null, logs = []
  try {
    const { data: runs } = await sc.from('admin_logs').select('*').eq('event_type', 'yfinance_run').order('created_at', { ascending: false }).limit(1)
    lastRun = runs?.[0] ?? null
    const { data } = await sc.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(50)
    logs = data || []
  } catch {}

  return (
    <SistemaClient
      pingMs={pingMs} pingOk={pingOk}
      lastRun={lastRun} logs={logs}
      nextRun={nextSunday6UTC()}
    />
  )
}
