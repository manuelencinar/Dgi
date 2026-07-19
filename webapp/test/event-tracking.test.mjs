import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveEvent } from '../lib/event-tracking.js'

test('páginas mapeadas → section + page_view (GET)', () => {
  assert.deepEqual(resolveEvent('/screener', 'GET'), { section: 'screener', event_name: 'page_view' })
  assert.deepEqual(resolveEvent('/cartera/dividendos', 'GET'), { section: 'cartera', event_name: 'page_view' })
  assert.equal(resolveEvent('/watchlist', 'GET').section, 'watchlist')
})

test('ficha de empresa captura el ticker en metadata', () => {
  const r = resolveEvent('/empresa/MUV2.DE', 'GET')
  assert.equal(r.section, 'ficha_empresa')
  assert.deepEqual(r.metadata, { ticker: 'MUV2.DE' })
})

test('acciones clave por API con event_name específico', () => {
  assert.deepEqual(resolveEvent('/api/comparador', 'POST'), { section: 'comparador', event_name: 'comparacion_hecha' })
  assert.deepEqual(resolveEvent('/api/watchlist', 'POST'), { section: 'watchlist', event_name: 'watchlist_accion' })
  assert.equal(resolveEvent('/api/procesar-aportaciones', 'GET').event_name, 'aportacion_procesada')
})

test('lista blanca: rutas no mapeadas → null', () => {
  assert.equal(resolveEvent('/api/admin/clean-logs', 'POST'), null)
  assert.equal(resolveEvent('/dashboard/actividad', 'GET'), null)
  assert.equal(resolveEvent('/_next/static/x.js', 'GET'), null)
  assert.equal(resolveEvent('/api/comparador', 'GET'), null)   // GET al API no es la acción clave
  assert.equal(resolveEvent('/algo-raro', 'GET'), null)
})

test('páginas solo en GET (un POST a una página no cuenta como page_view)', () => {
  assert.equal(resolveEvent('/screener', 'POST'), null)
})
