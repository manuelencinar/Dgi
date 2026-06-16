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
- Landing page pública — presenta la app y los planes de precio; testimonios sustituidos por **métricas reales** (nº mercados, empresas, etc.). Secciones (en `app/page.js`): Hero → **ForWhom** ("¿Es para ti?", #9) → **CompanyShowcase** (mockup de la ficha de empresa con Score/salud/insights, #11) → Benefits → **DualRanking** → **UseCase** (mockup del screener filtrado, #8) → HowItWorks → Markets → PlatformMetrics → Pricing → FAQ. (La sección de noticias `LandingNews` se quitó de la landing — daba sensación de incompleta cuando NewsAPI no responde; el componente sigue existiendo.) FAQ ampliado (`LandingFaq.js`): cómo se calcula el Score, datos no en tiempo real, diferencias vs competidores, uso desde España/brókers.
- Página de mercados — lista de 43 mercados globales con tarjetas resumen
- Página de cada mercado individual — empresas del índice con análisis DGI
- Screener avanzado rediseñado (`/screener`) — tarjetas, filtros free+premium, proyección €1k, comparador — ver "Screener rediseñado"
- Reyes, Aristócratas y Aspirantes (`/aristocratas`) — clasificación por racha de dividendo — ver "Clasificación DGI por racha"
- Comparador de empresas (`/comparador`) — radar, tabla, proyección, export CSV/PNG — ver "Comparador"
- Página de detalle de cada empresa — gauge salud financiera, valoración sector-aware, ROIC, historial dividendos, gráfico de precios (daily_prices), estados financieros
- Módulo de cartera completo (app/cartera/) — ver sección "Módulo de cartera"
- Watchlist (`/watchlist`) — empresas seguidas con precio/yield objetivo y alertas — ver "Watchlist + notificaciones"
- Notificaciones (`/notificaciones`) + campana en el menú — ver "Watchlist + notificaciones"
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

### Diversificación por supersectores (Morningstar) + perfil de inversor
- **Taxonomía de 3 niveles** (`lib/supersectors.js` + `lib/taxonomy.js`): Supersector (Cíclico/Sensible/Defensivo + Otros para ETFs/sin dato) → Sector (los 11 de Yahoo) → Industria (lista detallada, inglés Yahoo + español). El **sector** (de `company_fundamentals.sector`) determina el supersector; la **industria** se almacena pero NO entra en el gráfico. `sectorInfo(sector)` mapea sector→{sup, es}.
- **Gráficos de cartera** (`components/cartera/SectorBreakdown.js`): donut de dos anillos (nivel super interior + nivel detalle exterior en tono del mismo color) + leyenda de barras agrupadas. **Sectores**: `SectorBreakdown` con `calcSectorBreakdown(enriched)` (supersector→sector). **Zona geográfica**: el MISMO componente `SectorBreakdown` (título/hint parametrizables) con `calcGeoBreakdown(enriched)` (continente→país, con bandera+nombre). **Divisa**: `DonutBreakdown` (export de SectorBreakdown.js, gráfico de UN nivel con el mismo estilo). Todo en `lib/portfolio.js`.
- **Alerta por país** (`calcAlerts`): si un país supera el umbral del valor de la cartera → aviso. `COUNTRY_ALERT_LIMIT=30`, EE.UU. excepción `COUNTRY_ALERT_LIMIT_US=50` (mercado dominante natural en DGI).
- **Ficha de empresa** (`app/empresa/[ticker]/page.js` → prop `classification`): la cabecera muestra los 3 niveles en español — **Supersector → Sector → Industria** (chips), desde `detail.sector`+`detail.industry` vía `sectorInfo`/`industryEs`. Fallback al sector del DICT si no hay fundamentales. El **buscador** (`app/api/search`) muestra solo el **sector en castellano** (`sectorLabelEs`).
- **Perfil de inversor** (`components/cartera/InvestorProfile.js`): el usuario elige Defensivo (60/20/20), Equilibrado (~33 c/u) o Crecimiento (20/50/30) — pesos OBJETIVO por supersector en `INVESTOR_PROFILES`. `calcProfileFit(enriched, profileKey)` compara el reparto real (excluye ETFs/fondos y renormaliza los 3) con el objetivo (score de encaje por distancia de variación total). El encaje entra como criterio en `calcDiversificationScore(enriched, profileKey)`. El perfil se guarda en **`user_settings.investor_profile`** vía `/api/ajustes` (asociado a la cuenta, no localStorage).
- **Editor de taxonomía** (Dashboard → Datos → pestaña "Sectores", `components/dashboard/SectorAssignClient.js`): buscador + tabla con 3 desplegables encadenados (supersector → sector → industria). API `/api/admin/company-taxonomy` (GET lista, POST asigna, admin-guarded): escribe `sector`/`industry` en `company_fundamentals` y marca **`taxonomy_locked=true`**. `update_fundamentals.py` (`apply_manual_protection`) preserva sector/industria de las filas bloqueadas (Yahoo no las pisa). El gráfico de cartera usa el sector corregido automáticamente. NOTA: el screener usa la taxonomía propia del DICT (pestaña "Empresas"), independiente de esta.

### Tablas Supabase del módulo de cartera
- `positions` — posiciones del usuario (ticker, shares, avg_cost, currency)
- `transactions` — historial de operaciones compra/venta
- `dividends_received` — dividendos cobrados registrados por el usuario
- Las tres con RLS por `auth.uid() = user_id`
- Columnas añadidas a `user_settings`: `monthly_summary boolean`, `alert_config jsonb`, `alert_dismissed jsonb`
  (SQL en `webapp/sql/cartera_parte3.sql` — ejecutar en Supabase)
- `user_settings.investor_profile text` (default 'equilibrado') — perfil de inversor de la cartera (SQL en `webapp/sql/investor_profile.sql`, ya ejecutado)

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

## Sistema de bonificaciones por tendencia positiva (scoring DGI)
- Adicionales al scoring base: NO modifican umbrales ni penalizaciones, solo suman puntos extra por tendencias positivas sostenidas. Cap total **+1.0**; la nota final nunca supera 10. Requieren ≥3 años de histórico (si falta, se ignora la bonificación sin penalizar).
- Lógica única en `lib/bonuses.js` (`computeBonuses(data, sectorType)`), integrada en `lib/dgi-score.js` (`computeDGIScore` suma `bonus.total` tras penalizaciones y devuelve `bonuses`/`bonusTotal`). **Replicada en `scripts/update_fundamentals.py`** (`compute_bonus_fields`, deben coincidir) usando los jsonb anuales ya descargados.
- 6 bonificaciones desde income/balance/cashflow anuales: ROIC creciente (+0.3/+0.15), márgenes en expansión (+0.2/+0.1; energía/materiales usan media móvil 3a), reducción de deuda neta (+0.2/+0.1; utilities/REITs usan cobertura de intereses), FCF creciente y positivo (+0.2/+0.1; utilities usan CFO), aceleración del dividendo (cagr3 > cagr10×1.1; +0.1), caja neta positiva y mejorando (+0.1).
- Columnas en company_fundamentals (SQL en `webapp/sql/bonuses.sql`): `bonus_roic_trend`, `bonus_margin_trend`, `bonus_debt_reduction`, `bonus_fcf_growth`, `bonus_div_acceleration`, `bonus_net_cash`, `bonus_total`, `improving_flag` (boolean, true si `bonus_total >= 0.3`).
- Ficha de empresa: sección verde "Bonificaciones por tendencia positiva" al pie del Score DGI (solo si hay bonificaciones).
- Screener: badge "↑ Mejorando" (bonus_total ≥ 0.5) / "↗ Tendencia +" (≥ 0.3) junto a racha/foso, y filtro premium "Empresas mejorando" con selector (ROIC/Márgenes/Deuda/FCF). El screener lee `bonus_total`/`improving_flag` de la BD (los rellena el script Python).

## Disciplina de capital (CDR) — `lib/capital-discipline.js`
- CDR = (dividendos + recompras + adquisiciones) / FCF. Que la distribución total supere el FCF suele venir de **recompras**, NO de un dividendo insostenible.
- **Regla clave**: solo es problema si se financia con DEUDA. `computeCDR` expone `debtRising` (deuda neta termina positiva, ha crecido y >15% en ~4a) para distinguir "recompras con caja" (Munich Re) de "distribución financiada con deuda".
- **No baja la nota** del dividendo (se quitó la penalización del CDR en `dgi-score.js`) ni el color del gauge de salud (`health.js`, depende solo del payout). El aviso vive en los **insights** (`company-detail.js`): negativo solo si `debtRising`; si no, nota neutra "recompras con caja, no compromete el dividendo".

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

## Watchlist + notificaciones
- Tablas `watchlist` y `notifications` (SQL en `webapp/sql/watchlist.sql`, RLS por `auth.uid()=user_id`). `watchlist` tiene `target_price`, `target_yield`, `notes`, `alert_price_active`, `alert_yield_active` + flags internos anti-spam `alert_price_triggered`/`alert_yield_triggered` (no en el spec original, necesarios para no repetir alertas). `notifications` tipos: `watchlist_price`, `watchlist_yield`, `dividend_cut`, `recurring`.
- Página `/watchlist` (`app/watchlist/page.js` server → `components/WatchlistClient.js`): tabla con precio actual, variación, Score, yield, precio/yield objetivo + distancia, alerta, notas, fecha; resalte de fila verde si está en zona de compra (precio ≤ objetivo) o cerca (≤5%). Estado vacío + límite freemium.
- Página `/notificaciones` (`app/notificaciones/page.js` → `components/NotificationsClient.js`): lista completa + marcar todas como leídas.
- Campana 🔔 en el menú (`components/NotificationBell.js`, dentro de `NavMenu.js`): dropdown con últimas 5, punto rojo con nº no leídas, "Ver todas".
- Enlace Watchlist en `NavMenu` entre Screener y Cartera. Mini watchlist en la cartera (`components/cartera/WatchlistMini.js`, debajo de posiciones): 5 más próximas al objetivo.
- Botón Seguir/Siguiendo en la ficha de empresa (`components/watchlist/FollowButton.js`, junto a "Comparar con otras") con modal (precio/yield objetivo, notas, toggles de alerta). Icono ojo 👁 en las tarjetas del screener (`components/watchlist/WatchlistEyeButton.js`, alta directa sin modal; relleno si se sigue). Sin sesión → redirige a `/login?next=…&msg=watchlist` (mensaje en `app/login/page.js`).
- **Alerta de precio rápida** (`components/watchlist/PriceAlertButton.js`, botón 🔔 junto al ojo en la tarjeta del screener): mini-modal "avísame cuando baje a X€" con atajos −5/−10/−15% sobre el precio actual. Sin salir de la página: crea/actualiza la entrada de watchlist (`target_price` + `alert_price_active`) vía POST y PUT-si-existe. El cron de alertas existente hace el resto. Para free cuenta contra el límite de 10. El modal **explica cómo funciona** (campana in-app siempre; email solo Premium; se comprueba tras el cierre de cada mercado).
- Lógica: `lib/watchlist.js` (helpers puros: `FREE_WATCHLIST_LIMIT=10`, `priceProximity`, `priceForYield`), `lib/watchlist-enrich.js` (`buildWatchlistRows` server-side: combina watchlist + DICT + fundamentales + daily_prices → precio, score, yield, proximidad; `sortByProximity`).
- APIs: `/api/watchlist` (GET/POST/PUT/DELETE, RLS, aplica límite freemium en POST), `/api/watchlist/enriched` (GET, para la mini), `/api/notifications` (GET lista+nº no leídas, POST marca leídas).
- Cron `/api/check-watchlist-alerts` (service_role, en `vercel.json`: `30 16` y `30 22` L-V, 30 min tras cada cierre). Comprueba alertas activas, crea notificación in-app siempre y envía email (Resend) solo a premium. Anti-spam: no repite hasta que el precio/yield sale de zona y vuelve a entrar. CRON_SECRET opcional.
- **Freemium**: gratuito hasta 10 empresas, sin alertas por email (pero sí notificación in-app); premium ilimitado + email.
- También genera notificación `recurring` al ejecutarse una aportación periódica (en `/api/procesar-aportaciones`). Pendiente: notificación `dividend_cut` (no hay job detector aún).

## Aportaciones periódicas (solo ETFs/fondos)
- Tabla `recurring_contributions` (SQL en `webapp/sql/recurring.sql`) + `transactions.price_date`.
- Configurar desde la ficha del fondo (`components/cartera/RecurringButton.js`). Helpers en `lib/recurring.js`.
- API `/api/procesar-aportaciones` (GET) + cron diario 9:00 UTC en `webapp/vercel.json`. Crea transacciones `buy_recurring`, recalcula precio medio, avanza next_date, registra en admin_logs.
- Visible en cartera (sección activas), historial (pestaña dedicada) y proyección (desglose periódicas/extra).

## Screener rediseñado (lib/screener.js + components/ScreenerClient.js)
- Vista de tarjetas, filtros free (yield, zona, sector) + premium con candado (racha, CAGR div, ROIC, deuda, foso, margen seguridad), selección para comparador, guía de métricas (HelpGuide), proyección €1k a 10 años.
- **Dos modos de ranking** (toggle superior): **⭐ Calidad DGI** (órdenes ⭐ Nota / 💰 Rentables / 🎯 Baratas / 💎 Dividendo) y **🏦 Renta DGI** (órdenes 🏦 Renta / 📈 Yield neto / ⏱ Recuperación). `rentaScore(co, destWHT)` = 60% yield neto + 40% rapidez de recuperación; `netYieldOf(co, destWHT)`.
- `lib/screener.js`: `resolveRoic(f)` = `roic_display ?? min(reported, tangible)` (nunca el legacy roic). `project10y` con fade lineal del CAGR (CAGR_CAP=12, CAGR_TERMINAL=3, FADE_YEARS=10) vía `divGrowthFactor`. `paybackYear`, `computeScore`, `calcDivQuality`, `deriveMoat`, `moatErosion`, `mosUnreliable`, `rule1010`, `scoreRadar`, `RADAR_METRICS`, `cleanGrossMargin`, `netYield`, `getWHT`.
- **Reglas de fiabilidad del Score** (en `computeScore`): empresa sin dividendo → score null (no puntúa 10). **Métricas sin datos puntúan 0** (no se omiten) → evita notas infladas cuando faltan financieros (p.ej. ADR NVO con solo precio+dividendo); las métricas especializadas que el screener no calcula (cet1, npl, p_affo…) se excluyen para no hundir bancos/REITs (clave: `m.id in vals`). **CAGR div >50%** (capeado/atípico) → puntuación neutra 5. **|MoS|>500%** (valor intrínseco no fiable, p.ej. investment trusts) → excluido del Score y del orden "Baratas", etiqueta "MoS no fiable". **Erosión del foso** (`moatErosion`) → **−1,0** a la nota (ya no es solo el badge 📉). CAGR cap visual 50%. VIX/VVIX excluidos. Dedup de tickers.
- **Empresas con precio sin dato o penny (<0,01, se ven "0,00" e inflan el yield, p.ej. Urbas) no se muestran** (filtro `< 0.01` en `buildScreenerCompanies`). Mismo enfoque en `/aristocratas`, `/canibales`, `/compounders` y la búsqueda global.
- **Diseño responsive de la tarjeta** (clases `.scr-*` + media query 760px): en móvil una sola línea (bandera · nombre · badge de nivel · yield · nota); en escritorio la tarjeta completa con proyección/métricas.
- **Cartera ↔ screener** (#5): el screener LEE params de la URL (`app/screener/page.js` → `parseInitialFilters`): `sector`, `zona`, `yield` (acepta 0.035 o 3.5), `cagr`, `streak`, `roic`, `score`. Si `from=cartera` + `hueco=…`, `ScreenerClient` muestra un banner "Para complementar tu cartera: …" con cierre que limpia filtros. Esto completa el flujo del detector de huecos (`components/cartera/CompanyDetector.js`), que antes redirigía a un screener que ignoraba los params (bug).
- **Explicación de "zona de compra"** (`buyZoneReason(co)` en `lib/screener.js`): línea verde bajo cada tarjeta con hasta 2 razones. **Umbrales EXIGENTES** (solo oportunidades claras; las señales de valoración por separado son comunes ~10% c/u, la selectividad viene del gate de calidad — "barata Y buena" es raro): requiere `co.sc ≥ 6.5` **Y** foso no erosionado (`!co.ero`) **Y** al menos una señal fuerte — yield ≥+25% sobre su media histórica (`yield_avg`/`yield_avg_years`, ≥3 años), MoS ≥25% (≥35% = "por debajo de su valor intrínseco"), o a <6% de su mínimo de 52 sem. El precio por debajo de la **MM200** (≥5%), PER previsto < actual×0.85 y la regla 10/10 son razones SECUNDARIAS (acompañan a una señal fuerte, nunca disparan solas). Constantes `BZ_*` al inicio de la función.
- **MM200 (media móvil 200 sesiones)**: columna `ma200` (SQL `ma200.sql`), calculada en `update_fundamentals.py`/`backfill_yield_avg_yahoo.py` desde el histórico de Yahoo (media de los últimos 200 cierres). En la ficha, la tarjeta de Valoración muestra "cotiza X% por encima/debajo de su MM200" (verde si por debajo). En el screener entra como razón secundaria de zona de compra. El screener lee `pe_forward`, `week52_high/low`, `yield_avg`, `yield_avg_years`.
- **Doble modo de ranking explicado**: bajo el toggle Calidad/Renta hay una línea descriptiva del modo activo (antes solo tooltip). La landing (`app/page.js`, sección `DualRanking`) presenta ambos modos al usuario no registrado.
- **Gate de yield mínimo DGI** (`MIN_DGI_YIELD = 0.3` en `lib/screener.js`): `computeScore` y `calcDivQuality` devuelven null si el yield < 0,3% → empresas con dividendo testimonial (p.ej. NVDA) no rankean como calidad. **CAGR div >50% se muestra como "⚠ atípico"** (no el número capeado).
- **Saneo de datos absurdos (también en la ficha)**: `computeValuation` (dispatcher en `lib/valuation.js`) marca la valoración **no fiable** (`available:false`) si el MoS sale extremo (<−85% o >500%) — artefacto de datos/divisa (p.ej. Infosys iv en escala errónea); arregla el "−99%" en la ficha y excluye ese MoS de la categoría Valoración del score. El `payout_fcf` absurdo (<0 o >300%) se **anula en origen** (`update_fundamentals.py` + backfill `scripts/fix_payout.mjs`, 166 empresas) → ficha/salud/score caen a `payout_eps`. En el screener: `sanePayout(f)` en `lib/screener.js` (payout FCF preferido, EPS de respaldo, null si ambos >300% — evita artefactos tipo Infosys 5422%; usado en display y en el scoring `mapValues`). `mosUnreliable` también marca DCF roto cuando MoS < −90% (valor intrínseco ínfimo vs precio, p.ej. unidades/divisa mal). Muestran "n/f"/"—" en vez del valor absurdo.
- **Foso sector-aware** (`computeMoat` en `lib/company-detail.js`): banca/seguros se evalúan por **ROE + escala + racha** (no ROIC/márgenes, que no aplican) → resuelve la contradicción "Sin foso" con Score alto (p.ej. Munich Re). Fallback "Foso difícil de medir con métricas estándar en banca/seguros". **REITs** tienen su propia rama (escala/market cap + crecimiento de rentas + margen operativo + racha; ROIC/márgenes brutos no aplican).
- **Explicación del Score DGI** en la ficha: intro en la `DGIScoreCard` detallada (0–10, ponderado por sector, 4 dimensiones, penalizaciones/bonificaciones, leyenda de colores).
- **Preview sin sesión** (#1): `components/LoggedOutPreview.js` — `/watchlist` y `/cartera` muestran un mock difuminado con datos de ejemplo + CTA "Empezar gratis" en vez de redirigir directo al login. (El middleware no bloquea estas rutas a no-autenticados; solo `/app` y `/dashboard`.)
- **Freemium del screener — muestra de 50 empresas** (CAMBIO de modelo): el usuario free SOLO recibe 50 empresas en el payload (el resto NO se carga, requiere suscripción) y tiene TODOS los filtros y datos sobre ellas (el límite del plan es el nº de empresas, no los filtros: `lock=false`, sin el corte `if(!isPremium) return true`). Selección DETERMINISTA (siempre las mismas) con reparto por índice: 1 IBEX 35, 1 DAX, 1 CAC 40, 1 FTSE 100, 5 S&P 500 y 41 del resto del mundo (orden pseudo-aleatorio estable por hash del ticker). `selectFreeSample()` en `lib/screener-companies.js` usando `getIndexConstituents` de `lib/index-constituents.js`; `app/screener/page.js` aplica la muestra si `plan!=='premium'`. Banner/cabecera: "muestra de 50 · N con Premium". El patrón "premium revela cuáles" sigue en el radar de mercados (`MarketDetail.js`).
- **Gating premium SIN CSS-blur** (seguridad): difuminar no basta (se quita por DevTools o se lee el payload). Regla: el componente server NO envía datos premium a usuarios free (anula/reduce las props), y el `PremiumGate` renderiza un esqueleto FICTICIO, nunca los `children` reales. Aplicado a: ficha de empresa (`app/empresa/[ticker]/page.js` + `CompanyDetailPage.js`, `empresa/HealthPanel.js`, `empresa/FinanzasSections.js`), radar de mercados (`app/mercados/[symbol]/page.js` reduce `dgiMetrics` a solo el conteo + teasers), analytics de cartera (`PortfolioDGIScore`, `CurrencyAnalysis`, `PortfolioPage`). El wizard "construir cartera" calcula el plan en el SERVER (`/api/construir-cartera`) y solo manda el plan (free: 5 + conteo). Comparador (limita nº) y screener (muestra de 50) no exponían datos tras blur.

## Construir cartera desde cero (#11) — wizard
- Página `/construir-cartera` (`app/construir-cartera/page.js` server → `components/ConstruirCarteraClient.js`). Wizard de 4 preguntas (aportación mensual, yield objetivo, horizonte, sectores a excluir) → plan de ~12 empresas DGI **ordenadas por prioridad de entrada** con asignación mensual sugerida (%, €/mes).
- Lógica en `lib/build-plan.js` (`buildPortfolioPlan(companies, {monthly, targetYield, horizon, excludeSectors, destWHT, size})`, pura): filtra calidad (`sc≥6`, sin erosión, paga dividendo), puntúa con pesos yield/calidad/crecimiento según horizonte, **bonus de entrada si está en zona de compra** (`buyZoneReason`), diversifica (máx 3/sector), ordena entrada-ahora primero. Reúsa `buyZoneReason`/`netYield`.
- **El plan se calcula en el SERVER** (seguridad: el universo NO llega al cliente): API `POST /api/construir-cartera` recibe las 4 respuestas, construye el universo (`buildScreenerCompanies` de `lib/screener-companies.js`, compartido con el screener) + `buildPortfolioPlan`, y devuelve solo el plan. La página solo manda al cliente los nombres de sector (paso 4); `ConstruirCarteraClient` pide el plan por fetch al entrar en "result".
- **Freemium**: el server devuelve a free solo las 5 primeras del plan + el conteo del resto (`hidden`); premium el plan completo. Entradas: CTA en la cabecera del screener + "Construir cartera" en `NavMenu` (secundario) + CTA en el onboarding.
- **Persistencia**: respuestas y flag "generado" en `localStorage` (`construir-cartera:v1`); al volver, recupera el plan re-pidiéndolo al server.
- **Seguir el plan**: botón "👁 Seguir el plan en mi watchlist" añade todas las empresas (en orden de prioridad) vía `/api/watchlist`; respeta el límite freemium (10) con mensaje + CTA Premium.

## Score DGI histórico (#6)
- Tabla `score_history` (SQL en `webapp/sql/score_history.sql`, RLS lectura pública): `ticker`, `date`, `score` (= `dgiScore.total`), `prepenalty`, `sector_type`, `unique(ticker,date)`. **Sin backfill posible** — acumula desde el primer run.
- Snapshot: **API route** `app/api/cron/snapshot-scores/route.js` (NO un script Node: reúsa `computeMoat`/`computeValuation`/`computeDGIScore` de `@/lib/company-detail`, que usan el alias `@/` y solo resuelven dentro de Next). Pagina company_fundamentals de 100 en 100, calcula el MISMO score que la ficha y hace upsert. Protegida con `CRON_SECRET`. Cron semanal en `vercel.json` (lunes 6:00 UTC, tras el run de fundamentals).
- UI: sparkline `components/empresa/ScoreHistory.js` (SVG puro) en la `DGIScoreCard` detallada de la ficha. Muestra delta y nº de semanas; estado "acumulando histórico" si <2 puntos. `scoreHistory` se lee en `app/empresa/[ticker]/page.js` y baja por `CompanyDetailPage`.

## Rankings (sección) — Aristócratas + Caníbales
- Sección "Rankings" en el nav (antes "Aristócratas"): entrada `NavMenu` → `/aristocratas`. Pestañas compartidas `components/RankingsTabs.js` (👑 Aristócratas · 🦈 Caníbales · ⚙️ Compounding) al pie de las páginas; las páginas de caníbales/compounders pasan `active="/aristocratas"` a `PublicNav` para resaltar "Rankings".
- **Máquinas de Compounding** (`/compounders` → `app/compounders/page.js` + `components/CompoundersClient.js`): ranking de negocios capital-light de alta calidad. Gates: ROIC 18–100% (resolveRoic), CapEx/CFO ≤20% (`capex_cfo_pct`), crecimiento ingresos 4–60% (`revenue_cagr5`); topes para descartar artefactos de bajo capital. Excluye banca/seguros/REIT. Orden por ROIC desc. Free top 10. Headline ROIC + CapEx/CFO + Ingresos 5a + Score.
- **Caníbales de acciones** (`/canibales` → `app/canibales/page.js` + `components/CanibalesClient.js`): ranking por **% de acciones reducidas desde ~2022** (recompra neta real en NÚMERO de acciones). Mismo diseño que aristócratas. Free ve top 10, premium completo. Datos: columna `shares_reduced_pct` (+ `shares_base_year`) calculada desde "Diluted Average Shares" (ver `recalc_shares.mjs` / `compute_shares_reduction`). Caps de artefactos: descarta |>50%| (splits).

## Clasificación DGI por racha (Reyes/Aristócratas/Aspirantes)
- **Fuente única** en `lib/helpers.js`: `DIVIDEND_TIERS` (array) + `dividendTier(streak)` (devuelve id `rey`/`aristocrata`/`aspirante`/null) + `dividendTierInfo(streak)` (objeto del nivel) + `streakBadge(streak)` (solo el emoji). Umbrales: **Rey 👑 ≥50 · Aristócrata 🏆 25–49 · Aspirante ⭐ 10–24** (colores #fbbf24/#a78bfa/#60a5fa).
- **La racha solo cuenta INCREMENTOS reales** (`growth > 0`): un dividendo congelado (growth = 0) o recortado la rompe (antes contaba `>= 0`, inflando rachas de empresas estancadas como Telefónica). En `compute_streak` (`update_fundamentals.py`) y recalculado en BD con `scripts/recalc_streak.mjs --write` (561 empresas corregidas).
- **Tendencia negativa del dividendo** (`dividendTrend` + `dividendTrendBadges` en `lib/helpers.js`, desde `div_history`): cuando no hay racha positiva, badges/insights "N años bajando el dividendo" (caída), "N años sin subir (congelado)" y "N recortes en los últimos 10 años" (cuts10≥3). En la ficha: badges de cabecera (`computeBadges`), línea del Historial de dividendos (`DividendHistorySection`) e insights (`buildInsights`). El screener solo usa `div_streak` (sin historial), así que estas empresas simplemente pierden su tier.
- **Penalización en el Score DGI** (`buildPenalties` en `dgi-score.js`, usa `dividendTrend`): dividendo en caída o ≥3 recortes en 10 años → **−1,0**; solo congelado ≥2 años → **−0,4** (con tope, no acumula; reemplaza la antigua "recorte reciente −0,5"). Nota: distinto del CDR/recompras-con-caja, que NO penaliza.
- Reemplazó las medallas/etiquetas antiguas inconsistentes (🥇🥈🥉, "Campeón DGI") en TODA la app: screener, comparador, ficha de empresa (`streakBadge` local + `computeBadges`/insights en `lib/company-detail.js`), índices y CompanyRow.
- Página `/aristocratas`: `app/aristocratas/page.js` (server, reutiliza patrón del screener: dict + company_fundamentals) → `components/AristocratasClient.js`. Tres niveles con contador, buscador, filtro por continente y toggle "solo zona de compra". Freemium: niveles+contadores y 5 primeras por nivel visibles, resto tras CTA. Entrada "Aristócratas" en `NavMenu` entre Screener y Watchlist.

## Comparador de empresas (`/comparador`)
- Páginas/componentes: `app/comparador/page.js`, `components/ComparadorClient.js`, API `app/api/comparador/route.js`. Lógica en `lib/comparador.js`.
- `buildComparadorCompanies(tickers, destWHT)` — prioriza precio fresco de daily_prices, recalcula margen de seguridad, sub-scores, insights, usa `cleanGrossMargin`.
- UI: radar SVG (MultiRadar), tabla comparativa, ProjectionChart, gráfico combinado (recharts), export CSV/PNG (html2canvas). Freemium: 2 empresas gratis / 5 premium.
- **Peers del sector** (`peers` en `ComparadorClient`): bajo el buscador, chips de un clic con empresas del MISMO sector que las ya cargadas (p.ej. desde Munich Re → Hannover Re/AXA/Allianz). Usa `options[2]` (sector del DICT). Complementa el buscador libre.

## Ajustes del usuario (`/ajustes`)
- API `app/api/ajustes/route.js` (GET + POST) vía **service_role** con whitelist de preferencias — soluciona que la RLS de user_settings solo tiene policy SELECT (no INSERT/UPDATE de cliente), lo que hacía que "Guardado" no guardara nada.
- Lee también con `select('*')` + filtro JS (tolerante a columnas que no existan, p.ej. `premium_until`).
- IMPORTANTE seguridad: campos sensibles de user_settings (plan, role, stripe_customer_id, premium_until) NO deben ser escribibles por el cliente — toda escritura pasa por esta API con whitelist.

## Onboarding (`/onboarding`)
- `app/onboarding/page.js`, `components/OnboardingClient.js`, API `app/api/onboarding/route.js`. 3 pasos tras el registro.
- `proxy.js` redirige a `/onboarding` si `onboarding_completed=false`. SQL en `webapp/sql/onboarding.sql`.
- **Enganche al wizard #11**: en el paso "primera empresa" y en la pantalla final hay un CTA "🧭 Construir mi cartera desde cero →" a `/construir-cartera`. El handler `goWizard` llama antes a `save('complete')` para marcar el onboarding completado (si no, el proxy devolvería al usuario al onboarding al navegar).

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

## Cotizaciones múltiples (unificación de fundamentales)
- `lib/listings.js`: mapa **curado a mano** `PRIMARY` (ticker secundario → matriz/mercado de origen) + `primaryOf`, `isSecondary`, `otherListings`. NO heurístico: agrupar por nombre da falsos positivos graves (p.ej. Domino's Pizza Inc/DPZ, Domino's Australia/DMP.AX y Domino's UK/DOM.L son TRES empresas distintas). Solo pares verificados (ADRs claros, espejos OTC suizos `.SS`→`.SW`, y empresas de origen EEUU con CDI extranjero como ResMed/Amcor/Smurfit WestRock/CCEP → EEUU).
- **Dedup en screener/rankings**: `buildScreenerCompanies` y las páginas de aristócratas/caníbales/compounders excluyen las cotizaciones secundarias (`isSecondary(ticker)`) — solo aparece la matriz, no dos filas por empresa.
- `app/empresa/[ticker]/page.js`: si el ticker es secundario, `redirect()` a la matriz. La matriz carga `otherListings` (precio + divisa + país de cada mercado) y los muestra en la cabecera ("También cotiza en: 🏳 precio · ticker pequeño") vía prop `crossListings` en `CompanyDetailPage`.
- Pendiente/mejora futura: importar a la matriz los fundamentales que falten desde el ADR (convirtiendo importes a la divisa local); ampliar el mapa con más pares revisados; deduplicar el screener.

## Navegación
- `components/NavMenu.js` (app), `components/PublicNav.js` (landing), `components/cartera/CarteraNav.js` (cartera).
- Items principales: Mercados, Screener, **Rankings** (Aristócratas/Caníbales/Compounding), Watchlist, **Comparador**, Cartera. Construir cartera y ETFs como secundarios. (Comparador subido a primario para hacerlo descubrible.)
- **Empresas del mercado clicables**: `ConstituentRow` (`MarketDetail.js`) es un `Link` a la ficha. **Recuento de mercados consistente**: la landing usa `getEffectiveMarkets()` (activos, igual que /mercados) — antes mostraba los 48 de `MARKETS` crudo (incl. desactivados como Dow Jones Global Titans) descuadrando con el "43" de la copy. **MoS/payout saneados** también en el screener (`buildScreenerCompanies` usa `mosUnreliable(f)` y `sanePayout(f)`, no cálculos en línea). Campana de notificaciones (`NotificationBell`) junto a Ajustes cuando hay sesión. Se eliminó el botón "Mi Índice" (no aportaba). CarteraNav incluye "ETFs y Fondos".

## Infraestructura / despliegue
- Repo GitHub: rama por defecto **master** (la app vive ahí); `main` es el proyecto HTML original + funds.json de GitHub Pages (historiales independientes).
- Deploy: Vercel proyecto `invest-dgi`, dominio https://invest-dgi.vercel.app. Deploy con `cd webapp && vercel --prod --yes`.
- GitHub Action `update_fundamentals.yml` corre `scripts/update_fundamentals.py` (domingos 6:00 UTC + manual). Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
- GitHub Action de precios corre `scripts/update_prices.py` (daily_prices + exchange_rates + benchmarks).
- El script de fundamentals: pausa 1.5s/ticker (evita rate-limit de yfinance), `is_fresh` reintenta filas stub (current_price/revenue_cagr5 nulos), escribe en admin_logs, actualiza también la tabla `funds` (`update_funds`).
- NOTA: `update_fundamentals.py` NO tiene flag `--half` (asumirlo rompió update_all.yml en el pasado; ya corregido).

## SQL pendiente de ejecutar en Supabase (todos los ficheros en webapp/sql/)
Estado: el usuario ya ejecutó admin.sql, valuation_columns.sql, roic_columns.sql, cartera_parte3.sql, funds.sql, recurring.sql, fx_and_settings.sql, daily_prices.sql, `investor_profile.sql` (columna investor_profile en user_settings) y `taxonomy_locked.sql` (columna taxonomy_locked en company_fundamentals).
Ficheros que el usuario PUEDE tener aún pendientes de ejecutar (confirmar en entorno nuevo):
`roic_display.sql`, `funds_returns.sql` (incl. benchmark_name), `cancellations.sql`, `onboarding.sql`, `watchlist.sql` (tablas watchlist + notifications), `yield_avg.sql` (columnas yield_avg + yield_avg_years), `ma200.sql` (columna MM200), `score_history.sql` (tabla de histórico del Score DGI), `canibales.sql` (columnas shares_reduced_pct + shares_base_year), `compounders.sql` (columna capex_cfo_pct), y el ALTER de `premium_until` en user_settings.
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
- `user_settings` — config del usuario (stripe_customer_id, stripe_subscription_id, role, plan, premium_until, monthly_summary, alert_config, alert_dismissed, onboarding_completed, investor_profile, prefs de divisa/alertas). Sensibles: NO escribibles por cliente (vía `/api/ajustes` con service_role).
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
week52_high, week52_low, yield_avg, yield_avg_years, ma200, shares_reduced_pct, shares_base_year, capex_cfo_pct, market_cap_m, sector, industry, taxonomy_locked, country,
income_statement_annual, balance_sheet_annual, cashflow_annual,
income_statement_quarterly, balance_sheet_quarterly, cashflow_quarterly,
updated_at

## Scripts Python (scripts/) — YA CREADOS
- `update_fundamentals.py` — descarga yfinance de ~2000 empresas, calcula métricas (ROIC con la fórmula nueva, div_streak, div_cagr5, payout_fcf, net_debt_ebitda…), estados financieros 4 años anuales+trimestrales traducidos al español, upsert en Supabase via service role, NaN/Infinity→None.
  - **Dividendo / dps** (fuente del yield): `dps` = **dividendo del último año COMPLETO de `div_history`** (no `isPartial`), porque está en la MISMA unidad que el precio (p.ej. peniques en las `.L`) y es el reparto real. `info.dividendRate` solo como respaldo si no hay año completo: en muchas `.L` viene en libras (×100 de desajuste → yield 0,02%) o incluye specials/timing (p.ej. Ageas 4,5 vs 3,5 → 6,7% en vez de 5,2%). NUNCA `lastDividendValue`. `pays_dividend=false` y `dps=None` si no repartió el año anterior ni en curso. Backfill: `scripts/fix_dps_from_history.mjs` (1133 empresas). Anti-artefacto: yield >40% se descarta (`scripts/fix_bad_yield.mjs`). Diagnóstico de salud: comparar `dps/price` contra `yield_avg`.
  - **Yield histórico medio** (`compute_yield_avg`): calcula `yield_avg`/`yield_avg_years` desde `div_history` + `tk.history(period="6y", auto_adjust=False)` (media de hasta 5 años completos). Es la **fuente autoritativa** (cobertura total, divisa consistente con los dividendos). Alimenta la señal "zona de compra" del screener. ⚠️ requiere `yield_avg.sql` ejecutado antes del próximo run (si no, los upserts fallan).
  - **MM200** (`compute_ma200`): media de los últimos 200 cierres del mismo `tk.history`. Columna `ma200` (requiere `ma200.sql`). El backfill inmediato/total es `backfill_yield_avg_yahoo.py` (calcula yield_avg + MM200 a la vez para todas las empresas).
- `update_prices.py` — daily_prices + exchange_rates + benchmarks (Yahoo).
- `recalc_roic.mjs` (Node) — recalcula ROIC en BD desde los estados ya guardados (sin yfinance). `--write` para persistir.
- `recalc_streak.mjs` (Node) — recalcula `div_streak` en BD desde `div_history` con la regla `growth > 0` (un congelamiento rompe la racha). `--write`. Ya ejecutado (561 empresas).
- `recalc_shares.mjs` (Node) — calcula `shares_reduced_pct`/`shares_base_year` (ranking de Caníbales) desde los estados ya guardados (Diluted Average Shares), sin yfinance. Descarta artefactos (|>50%| = split). `--write`. SQL: `webapp/sql/canibales.sql`. La fuente autoritativa ongoing es `update_fundamentals.py` (`compute_shares_reduction`).
- `recalc_capex_cfo.mjs` (Node) — calcula `capex_cfo_pct` (= CapEx/CFO medio, CFO = FCF+|CapEx|) para el ranking de Compounding, desde el cashflow ya guardado. `--write`. SQL: `webapp/sql/compounders.sql`. Ongoing: `compute_capex_cfo` en `update_fundamentals.py`.
- `fix_stale_dividends.mjs` (Node) — script de una vez: marca como que NO reparten (dps=null, pays_dividend=false) las empresas con dividendo obsoleto (sin reparto el año anterior ni en curso según `div_history`). Sin yfinance. `--write`. Ya ejecutado (142 empresas). Mismo patrón que `recalc_roic.mjs` (createRequire desde webapp).
- `fix_dps_from_history.mjs` (Node) — recalcula `dps` = dividendo del último año completo de `div_history` (misma unidad que el precio) para empresas que pagan. Corrige yields mal calculados por `info.dividendRate` (unidad libras/peniques en `.L`, specials). `--write`. Ya ejecutado (1133 empresas).
- `fix_bad_yield.mjs` (Node) — descarta el dividendo (o cae al último año completo) cuando el yield es absurdo (>40%, special/precio en céntimos). `--write`. Ya ejecutado (5 empresas). `fix_yield_trend.mjs` fue una versión previa (reconciliación por tendencia), englobada por `fix_dps_from_history.mjs`.
- `backfill_yield_avg_yahoo.py` (Python) — backfill de **cobertura total** de `yield_avg`/`yield_avg_years`: reutiliza el `div_history` ya en BD y descarga SOLO el histórico de precios de Yahoo en bloque (`yf.download` por lotes), sin correr el pipeline completo. Misma lógica que `compute_yield_avg`. Para poblar ya sin esperar al run semanal o re-poblar periódicamente. `--write` (upsert por bloques de 500), `--limit N`, `--ticker X`. Requiere `yield_avg.sql` ejecutado. (Nota: `daily_prices` NO sirve de fuente porque solo tiene profundidad para tickers charteados — `update_prices.py --history` no está cableado.)

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
- **Gráficos recharts**: `app/layout.js` lleva un `<style>` global que quita el contorno blanco de foco (`outline:none` en `.recharts-*`) que el navegador dibujaba al hacer hover/click sobre los SVG.
- **Banderas + nombres de país**: fuente única `COUNTRY_INFO` (código ISO-2 → {flag, name ES}) en `lib/helpers.js`; `getCountry` la usa (cubre los ~40 países del universo; antes solo 15 → el resto salía 🌍 "Otro"). `getContinent` ampliado para que ningún país conocido caiga en "Otros". La ficha genera la bandera desde el código ISO con `countryFlag` (Unicode).

## Reglas importantes para Claude Code
- Hacer git commit antes de cualquier cambio grande
- No tocar componentes que funcionan sin pedirlo explícitamente
- Preguntar antes de crear ficheros nuevos fuera de la estructura existente
- Si un componente ya existe reutilizarlo en lugar de crear uno nuevo
- El contenido premium NO basta con difuminarlo: el server no debe enviar los datos premium al cliente free (ver "Gating premium SIN CSS-blur"). El gate muestra un esqueleto ficticio + botón de upgrade — nunca pantalla de bloqueo agresiva.
- **DICT** (`data/dict.js`): formato `[nombre, ticker_real, paisISO2, divisa, superSector, sectorName, type]`. NO meter entradas con el nombre como número ni el ticker como nombre de empresa (hubo basura de Dow Jones Global Titans: 53 filas DICT + 52 stubs en company_fundamentals + 1 override, ya eliminadas). Los tickers reales no llevan espacios.
- Mostrar guión en lugar de número cuando no hay dato disponible — nunca romper la página por datos ausentes
- No tocar ninguna otra página ni componente que no se haya pedido explícitamente
- Email admin: vayaebookk@gmail.com
- Los commits terminan con: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- webapp/AGENTS.md: esta versión de Next.js (16) tiene breaking changes; consultar `node_modules/next/dist/docs/` antes de escribir código de framework

## Ficheros lib clave
`lib/metrics.js` (ROIC), `lib/valuation.js`, `lib/screener.js`, `lib/screener-companies.js` (motor + `selectFreeSample`), `lib/comparador.js`, `lib/currency.js` (FX), `lib/prices.js`, `lib/company-chart.js`, `lib/portfolio.js`, `lib/portfolio-calc.js`, `lib/dgi-score.js`, `lib/supersectors.js` (3 supersectores + perfiles), `lib/taxonomy.js` (3 niveles sector/industria), `lib/build-plan.js`, `lib/index-constituents.js`, `lib/fund-fetch.js`, `lib/recurring.js`, `lib/admin.js`, `lib/admin-stats.js`, `lib/email.js`.
