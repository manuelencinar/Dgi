// Resolve hook para los tests: mapea el alias '@/...' (que en la app resuelve
// Next/webpack) a la raíz de webapp, para poder importar libs como lib/screener.js
// con el runner nativo de Node sin depender de Next.
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = process.cwd() // webapp (npm test corre desde aquí)

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let p = join(ROOT, specifier.slice(2))
    if (!extname(p)) {
      if (existsSync(p + '.js')) p += '.js'
      else if (existsSync(join(p, 'index.js'))) p = join(p, 'index.js')
    }
    return { url: pathToFileURL(p).href, shortCircuit: true }
  }
  // Imports relativos SIN extensión (que Next/webpack resuelven y Node no): probar .js
  try {
    return await nextResolve(specifier, context)
  } catch (e) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !extname(specifier)) {
      return nextResolve(specifier + '.js', context)
    }
    throw e
  }
}
