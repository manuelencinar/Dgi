# Mi Índice DGI — Contexto del proyecto

## Qué es esta app
Plataforma web freemium de análisis DGI (Dividend Growth Investing).
Cubre 43 mercados globales, casi 2000 empresas de más de 30 países.
URL del repositorio: https://github.com/manuelencinar/Dgi

## Stack técnico
- Frontend: Next.js 16 (Turbopack) con TypeScript/JS, App Router
- Base de datos y auth: Supabase (Postgres + Auth, RLS)
- Pagos: Stripe (configurado con plan mensual y anual)
- Hosting: Vercel (proyecto `invest-dgi`, https://invest-dgi.vercel.app)
- Emails: Resend (pendiente de configurar dominio; envío best-effort, se omite si falta RESEND_API_KEY)
- Datos financieros: yfinance via scripts Python en GitHub Actions (ya creados y en marcha)
- Next.js 16 usa `proxy.js` como middleware (NO `middleware.js`)

## Estructura de carpetas
```
/
├── webapp/        ← app Next.js principal
├── project/       ← ficheros del proyecto HTML original
├── scripts/       ← scripts Python para actualización de datos
└── .git/          ← repositorio git
```

## Páginas construidas y funcionando
- Landing page pública — presenta la app y los planes de precio; testimonios sustituidos por **métricas reales** (nº mercados, empresas, etc.)
- Página de mercados — lista de 43 mercados globales con tarjetas resumen
- Página de cada mercado individual — empresas del índice con análisis DGI
- Screener avanzado rediseñado (`/screener`) — tarjetas, filtros free+premium, proyección €1k, comparador — ver "Screener rediseñado"
- Comparador de empresas (`/comparador`) — radar, tabla, proyección, export CSV/PNG — ver "Comparador"
- Página de detalle de cada empresa — gauge salud financiera, valoración sector-aware, ROIC, historial dividendos, gráfico de precios (daily_prices), estados financieros
- Módulo de cartera completo (app/cartera/) — ver sección "Módulo de cartera"
- Página de ETFs (`/etfs`) — ETFs DGI de referencia + fondos de usuarios, con TER/rentabilidades/benchmark
- Ficha de producto de ETF/fondo (`/fondo/[ticker]`) — precio, métricas, distribuciones, rentab. vs benchmark, posición
- Ajustes (`/ajustes`) — preferencias del usuario, divisa, plan, alertas — guarda vía `/api/ajustes` (service_role)
- Onboarding (`/onboarding`) — 3 pasos tras registro — ver "Onboarding"
- Cancelación con retención (`/cancelar`) — pausa/descuento/feedback — ver "Flujo de cancelación"
- Panel de administración (`/dashboard`) — solo admin — ver sección "Panel de administración"

## Módulo de cartera (app/cartera/)
Implementado en tres partes. Páginas:
- `/cartera` — resumen, posiciones, concentración, diversificación, dividendos en riesgo, coste fiscal, Score DGI con benchmark, detector de empresas que encajan
- `/cartera/nueva-posicion` — alta de operación (compra/venta) con recálculo de precio medio ponderado
- `/cartera/proyeccion` — proyección de renta con CAGR real por empresa (3 escenarios) + análisis DRIP
- `/cartera/calendario` — calendario de dividendos personal (vista calendario y lista)
- `/cartera/simulador` — what-if: añadir posición, recorte de dividendo, reinversión DRIP, independencia financiera
- `/cartera/historial` — operaciones, dividendos cobrados, yield on cost histórico (export CSV)
- `/cartera/alertas` — alertas personalizadas configurables + toggles de email y resumen mensual

Lógica en `lib/portfolio.js`, `lib/portfolio-calc.js`, `lib/dgi-score.js`, `lib/valuation.js`.
Navegación entre secciones en `components/cartera/CarteraNav.js`.

### Tablas Supabase del módulo de cartera
- `positions` — posiciones del usuario (ticker, shares, avg_cost, currency)
- `transactions` — historial de operaciones compra/venta
- `dividends_received` — dividendos cobrados registrados por el usuario
- Las tres con RLS por `auth.uid() = user_id`
- Columnas añadidas a `user_settings`: `monthly_summary boolean`, `alert_config jsonb`, `alert_dismissed jsonb`
  (SQL en `webapp/sql/cartera_parte3.sql` — ejecutar en Supabase)

### Resumen mensual por email
- API route: `app/api/resumen-mensual/route.js` (GET)
- Cron job Vercel configurado en `webapp/vercel.json`: día 1 de cada mes a las 8:00 UTC
- Envío vía Resend — PENDIENTE de configurar (RESEND_API_KEY, RESEND_FROM). Sin la key el endpoint calcula pero no envía.
- Seguridad opcional del cron: env var CRON_SECRET (si se define, el endpoint la exige).
- Resend también pendiente para los emails de alertas.

## Precios diarios (tabla daily_prices) — FUENTE DE PRECIOS
- Tabla `daily_prices` (SQL en `webapp/sql/daily_prices.sql`): histórico de cierres por ticker y fecha.
- `lib/prices.js`: `getLatestPrice`, `getPriceHistory`, `getPriceChange`, `getMultiplePrices`, `getLastUpdateInfo`.
- `lib/company-chart.js`: `getCompanyChartData(ticker, range)` — sirve desde daily_prices; la primera vez hace backfill de 5 años desde Yahoo (archiva best-effort y sirve directo). Rangos 1M/3M/6M/1A/3A/5A (rangos nativos de Yahoo; period1/period2 solo para 3A).
- Gráfico de empresa en `components/empresa/PriceChart.js` (línea de retorno total + línea de precio medio morada + overlay de benchmark). Timeout 20s con mensaje "Historial de precios pendiente de carga".
- `scripts/update_prices.py`: descarga masiva de Yahoo a daily_prices + tipos de cambio. Incluye `BENCHMARK_TICKERS = ["^GSPC","^STOXX","URTH","^NDX","^FTSE","^GDAXI","^N225"]`.
- Cartera y comparador refrescan precios stale vía `/api/precios` (antes salían desactualizados hasta visitar la ficha de la empresa).

## Tipos de cambio / FX (tabla exchange_rates) — FUENTE ÚNICA DE DIVISA
- Tabla `exchange_rates` (SQL en `webapp/sql/fx_and_settings.sql`): pares de divisa por fecha.
- `lib/currency.js`: `getExchangeRate(from, to, date)` (mira hasta 5 días hábiles atrás, null si no hay), `getLatestExchangeRate`, `getExchangeRateChange`, `convertAmount`, `formatCurrency`. Crea el cliente supabase de navegador internamente.
- Usado en alta de operación, posiciones, historial, ajustes (widget FX + alerta de comisión + análisis de divisa).
- El script de precios también puebla exchange_rates.

## Sistema de valoración (lib/valuation.js)
- Valor intrínseco sector-aware. `computeValuation(data, moatWidth, type, currency)` y `recomputeValuation(engine, params, price)` (modo personalizado en cliente).
- 6 métodos: DCF·FCF (general), DDM (bancos/aseguradoras), Múltiplo AFFO (REITs), DCF·CFO (utilities), DCF·Prima riesgo (farmacéuticas), DCF·Normalizado (energía).
- Correcciones clave: el DCF **nunca** usa div_cagr5 para el crecimiento (usa media fcf_cagr5+revenue_cagr5); penalización al descuento por ingresos en declive; terminal 0 si 3+ años de caída; FCF base normalizado si el año reciente es negativo pero la media es positiva.
- Inputs editables por el usuario en la ficha (modo automático/personalizado, persistencia en localStorage).
- El script Python precalcula `intrinsic_value`, `valuation_warning`, `growth_input_used` en company_fundamentals.

## ROIC corregido (lib/metrics.js) — FUENTE ÚNICA
- Fórmula final (tras varias iteraciones con el usuario): **ROIC = NOPAT / (Patrimonio Neto + Deuda Total)**.
  - NOPAT = EBIT × (1 − tax_rate). Capital invertido = equity + deuda total, **SIN restar la caja** (decisión explícita: en negocios cash-light apenas afecta, en cash-rich evita distorsión).
  - Media de 2 años del capital invertido (helper `row2()`). Suelo del capital = 10% de los activos totales.
- `calculateROIC(data, currency)`, `roicForScoring(data)` (usa roic_display, cap a 60), `minRoic(reported, tangible)`.
- `roic_display = minRoic(roic_reported, roic_tangible)` — **siempre se adopta el valor más bajo**.
- Devuelve roic_reported y roic_tangible (sin goodwill). Bancos/aseguradoras → ROE; REITs → NOI/activos.
- `roic_warning` normalizado a mensaje-o-null (arregla el bug "⚠ false").
- Lo usan: gauge de salud, scoring DGI, ficha de empresa, screener, comparador.
- Script Python (`update_fundamentals.py`) guarda: roic_reported, roic_tangible, **roic_display**, roic_warning, nopat, invested_capital, invested_capital_tangible, tax_rate_effective.
- `scripts/recalc_roic.mjs` — script Node de una vez para recalcular ROIC en BD desde los estados financieros ya guardados (sin yfinance). Ejecutar con `--write`. SQL de la columna: `webapp/sql/roic_display.sql`.
- Resultados de referencia tras el fix: Edenred ~17,6%, ADP ~36%, MA ~61%, KO ~16,7%, JNJ ~17,7%.

## ETFs y fondos (módulo cartera)
- Tabla `funds` (SQL en `webapp/sql/funds.sql`, con 14 ETFs DGI precargados) + `positions.asset_type` (stock/etf/fund).
- API `/api/fund/lookup` (POST busca/descarga de Yahoo, resuelve ISIN→símbolo vía endpoint de búsqueda; PUT alta manual). Lógica compartida en `lib/fund-fetch.js` (`fetchAndStoreFund`).
- La ficha `/fondo/[ticker]` se auto-rellena de Yahoo si el fondo no está en la tabla.
- Limitación: Yahoo da pocos datos de fondos europeos (TER/ISIN suelen faltar → "—", no 0).
- El Score DGI de la cartera excluye ETFs/fondos; en concentración van a la categoría "ETFs y Fondos".
- **TER almacenado como DECIMAL** (0.0006 = 0,06%). El admin lo introduce en %, se guarda en decimal, se muestra en % con color (verde <0,20%, ámbar ≤0,50%, rojo >). Helpers `terPct`/`terColor` en `EtfsClient.js`.
- **Rentabilidades + benchmark** (SQL en `webapp/sql/funds_returns.sql`): columnas `return_1y`, `return_3y`, `benchmark_ticker`, `benchmark_name`, `benchmark_return_1y`, `benchmark_return_3y`. La página `/etfs` y la ficha muestran Rentab 1A/3A del fondo vs su benchmark (verde si lo bate). Usar `select('*')` (tolerante a columnas que aún no existan en BD).
- **Overlay de benchmark en el gráfico del fondo** (`PriceChart.js`): se superpone el índice como línea amarilla discontinua. Clave: el benchmark se interpola por **fecha real** y se **convierte a la divisa del fondo con el tipo de cambio histórico de cada día** (no rebase proporcional). Helpers: `interpSeries`, `convertToCurrency`, `alignBenchmark`. Mapa `BENCH_CCY` (^GSPC/URTH/^NDX→USD, ^STOXX/^GDAXI→EUR, ^FTSE→GBP, ^N225→JPY); se descarga el par FX `${benchCcy}${currency}=X` y se multiplica punto a punto.
- **Admin ETFs** (`components/dashboard/EtfsAdminClient.js`, en `/dashboard` → Datos): editar TER inline, elegir benchmark (selector + personalizado), recalcular rentabilidades. APIs `/api/admin/update-fund` y `/api/admin/calculate-returns` (recalcula desde daily_prices; descarga el benchmark de Yahoo si falta).

## Aportaciones periódicas (solo ETFs/fondos)
- Tabla `recurring_contributions` (SQL en `webapp/sql/recurring.sql`) + `transactions.price_date`.
- Configurar desde la ficha del fondo (`components/cartera/RecurringButton.js`). Helpers en `lib/recurring.js`.
- API `/api/procesar-aportaciones` (GET) + cron diario 9:00 UTC en `webapp/vercel.json`. Crea transacciones `buy_recurring`, recalcula precio medio, avanza next_date, registra en admin_logs.
- Visible en cartera (sección activas), historial (pestaña dedicada) y proyección (desglose periódicas/extra).

## Screener rediseñado (lib/screener.js + components/ScreenerClient.js)
- Vista de tarjetas, filtros free (yield, zona, sector) + premium con candado (racha, CAGR div, ROIC, deuda, foso, margen seguridad), 4 ordenaciones, selección para comparador, guía de métricas (HelpGuide), proyección €1k a 10 años.
- `lib/screener.js`: `resolveRoic(f)` = `roic_display ?? min(reported, tangible)` (nunca el legacy roic). `project10y` con fade lineal del CAGR (CAGR_CAP=12, CAGR_TERMINAL=3, FADE_YEARS=10) vía `divGrowthFactor` — el crecimiento se modera con los años (decisión del usuario). `paybackYear`, `computeScore` (null si no hay dividendo), `calcDivQuality`, `deriveMoat`, `moatErosion`, `rule1010`, `scoreRadar`, `RADAR_METRICS`, `cleanGrossMargin` (null para financieras con ~100% margen bruto), `netYield`, `getWHT`.
- Reglas: empresa sin dividendo (payout_fcf=0) → score/calidad null, NO puntúa 10. CAGR cap 50%. VIX/VVIX excluidos. Dedup de tickers (bug JUN3.DE).

## Comparador de empresas (`/comparador`)
- Páginas/componentes: `app/comparador/page.js`, `components/ComparadorClient.js`, API `app/api/comparador/route.js`. Lógica en `lib/comparador.js`.
- `buildComparadorCompanies(tickers, destWHT)` — prioriza precio fresco de daily_prices, recalcula margen de seguridad, sub-scores, insights, usa `cleanGrossMargin`.
- UI: radar SVG (MultiRadar), tabla comparativa, ProjectionChart, gráfico combinado (recharts), export CSV/PNG (html2canvas). Freemium: 2 empresas gratis / 5 premium.

## Ajustes del usuario (`/ajustes`)
- API `app/api/ajustes/route.js` (GET + POST) vía **service_role** con whitelist de preferencias — soluciona que la RLS de user_settings solo tiene policy SELECT (no INSERT/UPDATE de cliente), lo que hacía que "Guardado" no guardara nada.
- Lee también con `select('*')` + filtro JS (tolerante a columnas que no existan, p.ej. `premium_until`).
- IMPORTANTE seguridad: campos sensibles de user_settings (plan, role, stripe_customer_id, premium_until) NO deben ser escribibles por el cliente — toda escritura pasa por esta API con whitelist.

## Onboarding (`/onboarding`)
- `app/onboarding/page.js`, `components/OnboardingClient.js`, API `app/api/onboarding/route.js`. 3 pasos tras el registro.
- `proxy.js` redirige a `/onboarding` si `onboarding_completed=false`. SQL en `webapp/sql/onboarding.sql`.

## Flujo de cancelación con retención (`/cancelar`)
- `app/cancelar/page.js`, `components/CancelarClient.js`. APIs en `app/api/cancelar/{pausa,descuento,feedback,confirmar}/route.js` + `app/api/recovery-email/route.js`.
- Ofrece pausar la suscripción (Stripe pause_collection), aplicar descuento (cupón) o recoger feedback antes de confirmar la baja (cancel_at_period_end). SQL en `webapp/sql/cancellations.sql`.
- Pendiente: requiere Stripe real configurado por el usuario para probar de extremo a extremo.

## Panel de administración (`/dashboard`)
- Protección en `proxy.js` (Next.js 16 usa proxy, no middleware): solo `role='admin'` en user_settings (o email admin hardcodeado), redirección silenciosa a `/`.
- Páginas: Resumen, Datos (carga manual/CSV), Usuarios (métricas+gráfico), Índices (cobertura 43 mercados), Sistema (logs+acciones).
- API admin: `/api/admin/fetch-ticker`, `/api/admin/trigger-github-action`, `/api/admin/clean-logs`.
- Tabla `admin_logs` + columna `user_settings.role` (SQL en `webapp/sql/admin.sql`). Lógica en `lib/admin.js`, `lib/admin-stats.js`.
- Requiere env var `GITHUB_TOKEN` (ya configurada en Vercel) para disparar el workflow.
- IMPORTANTE: paginar consultas a company_fundamentals (límite 1000 de PostgREST) con `.range()`.

## Navegación
- `components/NavMenu.js` (app), `components/PublicNav.js` (landing), `components/cartera/CarteraNav.js` (cartera).
- Reorganizada: 3 items principales (Mercados, Screener, Cartera). Comparador y ETFs como secundarios en el menú hamburguesa móvil. Se eliminó el botón "Mi Índice" (no aportaba). CarteraNav incluye "ETFs y Fondos".

## Infraestructura / despliegue
- Repo GitHub: rama por defecto **master** (la app vive ahí); `main` es el proyecto HTML original + funds.json de GitHub Pages (historiales independientes).
- Deploy: Vercel proyecto `invest-dgi`, dominio https://invest-dgi.vercel.app. Deploy con `cd webapp && vercel --prod --yes`.
- GitHub Action `update_fundamentals.yml` corre `scripts/update_fundamentals.py` (domingos 6:00 UTC + manual). Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
- GitHub Action de precios corre `scripts/update_prices.py` (daily_prices + exchange_rates + benchmarks).
- El script de fundamentals: pausa 1.5s/ticker (evita rate-limit de yfinance), `is_fresh` reintenta filas stub (current_price/revenue_cagr5 nulos), escribe en admin_logs, actualiza también la tabla `funds` (`update_funds`).
- NOTA: `update_fundamentals.py` NO tiene flag `--half` (asumirlo rompió update_all.yml en el pasado; ya corregido).

## SQL pendiente de ejecutar en Supabase (todos los ficheros en webapp/sql/)
Estado: el usuario ya ejecutó admin.sql, valuation_columns.sql, roic_columns.sql, cartera_parte3.sql, funds.sql, recurring.sql, fx_and_settings.sql y daily_prices.sql.
Ficheros que el usuario PUEDE tener aún pendientes de ejecutar (confirmar en entorno nuevo):
`roic_display.sql`, `funds_returns.sql` (incl. benchmark_name), `cancellations.sql`, `onboarding.sql`, y el ALTER de `premium_until` en user_settings.
Si se monta un entorno nuevo, ejecutar en orden todos los ficheros de webapp/sql/.

## Planes y precios
- Gratuito: acceso permanente sin tarjeta con funciones básicas
- Premium mensual: 9,99€/mes
- Premium anual: 59,90€/año (equivale a 4,99€/mes, mostrar como 50% descuento)
- Sin prueba gratuita — el usuario premium paga desde el primer día
- Gestión de pagos via Stripe — ya configurado con los dos price IDs

## Contenido gratuito
- Lista de 43 mercados con cotización, variación diaria, Score DGI y yield real
- Yield real del índice vs bono del país
- Termómetro DGI como gráfico sin detalle de empresas
- Cotización de empresas dentro de cada mercado
- Número de empresas en zona de compra sin revelar cuáles
- Screener con filtros básicos: yield, zona geográfica y sector
- Página de empresa: cabecera, precio, yield, rango 52 semanas, historial dividendos básico

## Contenido premium
- Radar de oportunidades: empresas concretas en zona de compra
- Mapa de salud financiera detallado por empresa
- Evolución histórica del dividendo del índice completa
- Comparador de índices con todos los criterios DGI
- Desglose completo del Score DGI por índice
- Screener con filtros avanzados: racha, CAGR dividendo, ROIC, deuda, foso, margen de seguridad
- Página de empresa completa: gauge salud financiera, foso, DCF, proyección, insights, scoring, estados financieros completos

## Base de datos Supabase — tablas principales
- `portfolios` — cartera del usuario (data jsonb)
- `user_settings` — config del usuario (stripe_customer_id, stripe_subscription_id, role, plan, premium_until, monthly_summary, alert_config, alert_dismissed, onboarding_completed, prefs de divisa/alertas). Sensibles: NO escribibles por cliente (vía `/api/ajustes` con service_role).
- `company_fundamentals` — datos financieros de todas las empresas, actualización semanal
- `positions`, `transactions`, `dividends_received` — módulo cartera (RLS por user_id)
- `funds` — ETFs/fondos (TER decimal, returns, benchmark)
- `recurring_contributions` — aportaciones periódicas
- `daily_prices` — histórico de cierres (fuente de precios)
- `exchange_rates` — tipos de cambio históricos (fuente de divisa)
- `admin_logs` — logs del panel admin
- Tablas de cancelaciones/feedback (`webapp/sql/cancellations.sql`)

## Tabla company_fundamentals — campos principales
precio, dps, div_streak, div_cagr5, div_history, payout_fcf, payout_eps,
fcf_per_share, fcf_cagr5, debt_ebitda, net_debt, net_debt_ebitda,
interest_coverage, roic (legacy), roic_reported, roic_tangible, roic_display, roic_warning,
nopat, invested_capital, invested_capital_tangible, tax_rate_effective,
intrinsic_value, valuation_warning, growth_input_used,
roe, roa, operating_margin, net_margin, gross_margin,
current_ratio, revenue_cagr5, pe_trailing, pe_forward, ev_ebitda, beta,
week52_high, week52_low, market_cap_m, sector, industry, country,
income_statement_annual, balance_sheet_annual, cashflow_annual,
income_statement_quarterly, balance_sheet_quarterly, cashflow_quarterly,
updated_at

## Scripts Python (scripts/) — YA CREADOS
- `update_fundamentals.py` — descarga yfinance de ~2000 empresas, calcula métricas (ROIC con la fórmula nueva, div_streak, div_cagr5, payout_fcf, net_debt_ebitda…), estados financieros 4 años anuales+trimestrales traducidos al español, upsert en Supabase via service role, NaN/Infinity→None.
- `update_prices.py` — daily_prices + exchange_rates + benchmarks (Yahoo).
- `recalc_roic.mjs` (Node) — recalcula ROIC en BD desde los estados ya guardados (sin yfinance). `--write` para persistir.

## GitHub Actions (.github/workflows/) — YA CREADOS
- `update_fundamentals.yml` — domingos 6:00 UTC + manual. Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
- Workflow de precios para `update_prices.py`.

## Email de bienvenida — pendiente de configurar
- Servicio: Resend (requiere dominio propio verificado — pendiente de comprar dominio)
- Se envía al confirmar email, no al crear la cuenta
- Contenido: bienvenida, tres acciones concretas, botón ir a la app, mención del plan premium

## Diseño
- Fondo oscuro: #080b14
- Tipografía: Figtree
- Colores principales: índigo (#818cf8), verde (#34d399), rojo (#f87171), amarillo (#fbbf24)
- Diseño responsive — mobile first

## Reglas importantes para Claude Code
- Hacer git commit antes de cualquier cambio grande
- No tocar componentes que funcionan sin pedirlo explícitamente
- Preguntar antes de crear ficheros nuevos fuera de la estructura existente
- Si un componente ya existe reutilizarlo en lugar de crear uno nuevo
- El contenido premium aparece difuminado con botón de upgrade — nunca pantalla de bloqueo agresiva
- Mostrar guión en lugar de número cuando no hay dato disponible — nunca romper la página por datos ausentes
- No tocar ninguna otra página ni componente que no se haya pedido explícitamente
- Email admin: vayaebookk@gmail.com
- Los commits terminan con: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- webapp/AGENTS.md: esta versión de Next.js (16) tiene breaking changes; consultar `node_modules/next/dist/docs/` antes de escribir código de framework

## Ficheros lib clave
`lib/metrics.js` (ROIC), `lib/valuation.js`, `lib/screener.js`, `lib/comparador.js`, `lib/currency.js` (FX), `lib/prices.js`, `lib/company-chart.js`, `lib/portfolio.js`, `lib/portfolio-calc.js`, `lib/dgi-score.js`, `lib/fund-fetch.js`, `lib/recurring.js`, `lib/admin.js`, `lib/admin-stats.js`, `lib/email.js`.
