// Conversión HTML→PDF con Puppeteer + @sparticuz/chromium (funciona en el runtime Node
// serverless de Vercel). Reutiliza una única instancia de navegador entre invocaciones
// para minimizar arranques en frío. En local usa el Chrome/Chromium del sistema si existe.
import puppeteerCore from 'puppeteer-core'

let browserPromise = null

// Rutas típicas de Chrome en local (cuando no estamos en Vercel/AWS Lambda).
function localExecutable() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH
  if (envPath) return envPath
  const p = process.platform
  if (p === 'win32') return 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  if (p === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  return '/usr/bin/google-chrome'
}

// @sparticuz/chromium decide si extrae sus librerías compartidas (libnss3, etc.) y fija
// LD_LIBRARY_PATH según AWS_EXECUTION_ENV / AWS_LAMBDA_JS_RUNTIME. En Vercel esas variables
// no coinciden con lo que espera → NO extrae las librerías y Chromium falla con
// "libnss3.so: cannot open shared object file". Forzamos la rama AL2023 (glibc moderna,
// la de Vercel) fijando la variable ANTES de importar el módulo, y por eso el import es
// dinámico dentro de getBrowser (garantiza el orden respecto al setup de nivel de módulo).
async function launchServerless() {
  if (!process.env.AWS_EXECUTION_ENV && !process.env.AWS_LAMBDA_JS_RUNTIME) {
    process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs20.x'
  }
  const chromium = (await import('@sparticuz/chromium')).default
  return puppeteerCore.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  })
}

async function getBrowser() {
  if (browserPromise) {
    try {
      const b = await browserPromise
      if (b.connected) return b
    } catch {}
    browserPromise = null
  }
  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL
  browserPromise = isServerless
    ? launchServerless()
    : puppeteerCore.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: localExecutable(),
        headless: true,
      })
  return browserPromise
}

// Renderiza `html` a un Buffer PDF A4.
export async function htmlToPdf(html) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return pdf
  } finally {
    await page.close().catch(() => {})
  }
}
