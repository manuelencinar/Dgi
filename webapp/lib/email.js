// Envío de emails vía Resend. Best-effort: si no hay RESEND_API_KEY configurada
// (pendiente de dominio propio), no rompe — devuelve { skipped: true }.

const APP_URL = 'https://www.everdiv.com'

export async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.RESEND_FROM || 'EverDiv <noreply@everdiv.com>'
  if (!apiKey) return { skipped: true, reason: 'RESEND_API_KEY no configurada' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!res.ok) return { error: await res.text() }
    return { sent: true }
  } catch (e) {
    return { error: String(e.message || e) }
  }
}

// Envoltorio de email con el estilo de la app (fondo oscuro, índigo).
export function emailShell(title, bodyHTML) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080b14;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080b14;padding:24px 0">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0d1424;border-radius:14px;padding:28px">
  <tr><td>
    <p style="color:#818cf8;font-size:18px;font-weight:bold;margin:0 0 4px">EverDiv</p>
    <p style="color:#4a5270;font-size:13px;margin:0 0 20px">${title}</p>
    ${bodyHTML}
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

export function emailButton(href, label) {
  return `<table width="100%" style="margin:24px 0 8px"><tr><td align="center">
    <a href="${href}" style="display:inline-block;background:#6366f1;color:#fff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 28px;border-radius:8px">${label}</a>
  </td></tr></table>`
}

export { APP_URL }
