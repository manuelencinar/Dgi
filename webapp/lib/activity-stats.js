// Agregación de la actividad de usuarios para la pestaña "Actividad" del dashboard.
// Recibe un cliente de Supabase con service_role (bypass RLS) desde la página server.
// Toda consulta que pueda superar 1000 filas se pagina con .range().

const cutoffISO = days => new Date(Date.now() - days * 86400000).toISOString()

// Trae todas las filas de user_events desde el cutoff, paginando (límite 1000 de PostgREST).
async function fetchEventsSince(supabase, cutoff, cols) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('user_events')
      .select(cols).gte('created_at', cutoff).range(from, from + 999)
    if (error || !data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

// % de usuarios que ha usado cada sección en los últimos `days` días.
export async function getSectionUsage(supabase, days = 30) {
  const rows = await fetchEventsSince(supabase, cutoffISO(days), 'user_id, section')
  const totalUsers = new Set(rows.map(r => r.user_id)).size
  const bySec = {}
  for (const r of rows) {
    const s = r.section || 'otros'
    if (!bySec[s]) bySec[s] = { section: s, users: new Set(), eventos: 0 }
    bySec[s].users.add(r.user_id)
    bySec[s].eventos++
  }
  return Object.values(bySec)
    .map(x => ({
      section: x.section,
      usuarios_unicos: x.users.size,
      eventos: x.eventos,
      pct: totalUsers ? x.users.size / totalUsers * 100 : 0,
    }))
    .sort((a, b) => b.usuarios_unicos - a.usuarios_unicos)
}

// Usuarios únicos activos por día durante los últimos `days` días (rellena los días sin actividad).
export async function getDailyActiveUsers(supabase, days = 30) {
  const rows = await fetchEventsSince(supabase, cutoffISO(days), 'user_id, created_at')
  const byDay = {}
  for (const r of rows) {
    const d = String(r.created_at).slice(0, 10)
    if (!byDay[d]) byDay[d] = new Set()
    byDay[d].add(r.user_id)
  }
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    out.push({ fecha: d, usuarios_unicos: byDay[d]?.size || 0 })
  }
  return out
}

// Cuentas activas recientemente: última actividad, nº de eventos y secciones tocadas.
// Une el email desde auth.users (auth.admin.listUsers), como la página de Usuarios.
export async function getActiveAccounts(supabase, days = 30, limit = 100) {
  const rows = await fetchEventsSince(supabase, cutoffISO(days), 'user_id, section, created_at')
  const byUser = {}
  for (const r of rows) {
    if (!r.user_id) continue
    let u = byUser[r.user_id]
    if (!u) u = byUser[r.user_id] = { user_id: r.user_id, ultima_actividad: null, eventos: 0, secciones: new Set() }
    u.eventos++
    if (r.section) u.secciones.add(r.section)
    if (!u.ultima_actividad || r.created_at > u.ultima_actividad) u.ultima_actividad = r.created_at
  }
  const accounts = Object.values(byUser)
    .sort((a, b) => String(b.ultima_actividad || '').localeCompare(String(a.ultima_actividad || '')))
    .slice(0, limit)

  // Email por user_id (paginado, service_role).
  const emailById = {}
  try {
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data?.users?.length) break
      data.users.forEach(u => { emailById[u.id] = u.email })
      if (data.users.length < 1000) break
    }
  } catch {}

  return accounts.map(a => ({
    user_id: a.user_id,
    email: emailById[a.user_id] || null,
    ultima_actividad: a.ultima_actividad,
    eventos: a.eventos,
    secciones_usadas: [...a.secciones],
  }))
}
