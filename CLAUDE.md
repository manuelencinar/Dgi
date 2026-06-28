# EverDiv — Contexto del proyecto

(Antes "Mi Índice DGI"; renombrada a **EverDiv** en jun-2026. Dominio: everdiv.com.)

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
- Landing page pública — presenta la app y los planes de precio; testimonios sustituidos por **métricas reales** (nº mercados, empresas, etc.). Secciones (en `app/page.js`): Hero → **ForWhom** ("¿Es para ti?", #9) → **CompanyShowcase** (mockup de la ficha de empresa con Score/salud/insights, #11) → Benefits → **DualRanking** → **UseCase** (mockup del screener filtrado, #8) → HowItWorks → Markets → PlatformMetrics → Pricing → FAQ. (La sección de noticias se quitó de la landing y el subsistema de noticias `LandingNews`/`CompanyNews` + `/api/news/*` se **eliminó** del repo —dependía de NewsAPI y no estaba montado.) FAQ ampliado (`LandingFaq.js`): cómo se calcula el Score, datos no en tiempo real, diferencias vs competidores, uso desde España/brókers.
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
- **Novedades (`/novedades`)** — home de los usuarios REGISTRADOS (el proxy redirige `/`→`/novedades` si hay sesión; el visitante anónimo ve la landing) — ver "Novedades"

## Módulo de cartera (app/cartera/)
Implementado en tres partes. Páginas:
- `/cartera` — resumen, posiciones, concentración, diversificación, dividendos en riesgo, coste fiscal, Score DGI con benchmark, detector de empresas que encajan
- `/cartera/nueva-posicion` — alta de operación (compra/venta) con recálculo de precio medio ponderado
- `/cartera/proyeccion` — proyección de renta con CAGR real por empresa (3 escenarios) + análisis DRIP
- `/cartera/calendario` — calendario de dividendos personal (vista calendario y lista)
- `/cartera/simulador` — what-if: añadir posición, recorte de dividendo, reinversión DRIP, independencia financiera
- `/cartera/historial` — operaciones, dividendos cobrados, yield on cost histórico (export CSV)
- `/cartera/liquidez` — **Fondo de oportunidad** (ver sección propia)
- `/cartera/alertas` — alertas personalizadas configurables + toggles de email y resumen mensual

Lógica en `lib/portfolio.js`, `lib/portfolio-calc.js`, `lib/dgi-score.js`, `lib/valuation.js`.
Navegación entre secciones en `components/cartera/CarteraNav.js`.

### Página `/cartera` (PortfolioPage) — orden y bloques (rediseño escritorio)
Orden actual: **Posiciones arriba del todo** (lo clave) → FX (tarjeta estrecha ≤~20% en escritorio) → **Resumen** (4 tarjetas compactas en UNA fila vía `.summary-grid`: Valor total · Rentabilidad · **Renta anual NETA** [vía `calcFiscal`] · YoC medio) → **Meta de renta pasiva** (`IncomeGoalCard`) → Score DGI cartera → Empresas que encajan → proyección/evolución → Próximos cobros → watchlist mini → resto.
- **Columna "Coste neto"** en la tabla de posiciones: coste de compra − dividendos netos cobrados (de `dividends_received`), con el **YoC real** debajo (renta anual / coste neto); "✓ recuperada" si los dividendos superan el coste. También columna "Cobrado".
- **Meta de renta pasiva** (`income_goal` en user_settings vía `/api/ajustes`): objetivo €/año, barra de progreso y ETA solo con el crecimiento orgánico del dividendo (g5y). SQL: `income_goal.sql`.
- **Próximos cobros** (`components/cartera/UpcomingDividends.js`): widget que reutiliza `buildDividendCalendar` y muestra los próximos 5 cobros (fecha, empresa, importe neto, confirmado/estimado).
- **Score DGI de la cartera** (`PortfolioDGIScore`): compacto — solo el ponderado por valor a la izquierda + las 4 categorías a su derecha en pequeño (misma altura); benchmark plegado en `<details>`.
- Eliminado el bloque "Simular un recorte de dividendo" de `/cartera` (el simulador completo sigue en `/cartera/simulador`).
- **Fondo de oportunidad** (`CashFundCard` en `/cartera`): tarjeta con el saldo de liquidez + patrimonio total (invertido + liquidez), enlace a `/cartera/liquidez`. Se carga aparte vía `/api/cartera/liquidez`.

### Fondo de oportunidad (liquidez) — `/cartera/liquidez`
"Pólvora seca": la liquidez disponible para nuevas inversiones. `components/cartera/LiquidezPage.js` + `app/cartera/liquidez/page.js` + API `app/api/cartera/liquidez/route.js` (GET/POST/DELETE, RLS por usuario). Lógica pura en `lib/cash-fund.js` (testeada).
- Tabla `cash_movements` (SQL `cash_fund.sql`, **pendiente de ejecutar**): apuntes con importe CON SIGNO (+ entra, − sale); saldo = suma. `type`: deposit/withdraw/dividend/interest/investment. RLS por `auth.uid()=user_id`.
- **Intereses**: el usuario fija la **TAE** del banco (`user_settings.cash_interest_rate`, vía `/api/ajustes`). El GET del API **devenga automáticamente** (patrón del prefill de dividendos) el interés de cada mes CERRADO que falte: interés = saldo a fin de mes × TAE/12, capitalizado (compuesto), apuntado como movimiento `interest`. `pendingInterest`/`balanceOf`/`monthlyRate`/`estimateMonth|AnnualInterest` en `lib/cash-fund.js`.
- **Dividendos → fondo**: toggle `user_settings.dividends_to_cash`. Si está activo, al confirmar un cobro EN EFECTIVO en `/cartera/dividendos` (`routeToCash` en `DividendosPage`), su neto se inserta como movimiento `dividend` en `cash_movements`. (Los dividendos en acciones van a la cartera, no al fondo.)
- **Compra desde el fondo**: en `/cartera/nueva-posicion`, si es una COMPRA y el fondo tiene saldo (`fundBalance>0`), aparece una casilla "Pagar desde el fondo de oportunidad". Al guardar, se inserta un movimiento `investment` con el coste en EUR en NEGATIVO (en divisa extranjera se convierte con el tipo de cambio). Opcional, off por defecto (las compras con dinero nuevo no descuentan).
- **Inserciones directas vs API**: el saldo (`balanceOf`) suma los importes CON SIGNO. Las inserciones directas desde el cliente (`routeToCash` dividend +, compra investment −) ya llevan el signo; el POST del API lo aplica con `signOf(type)`.
- **Intereses APARTE**: no suman a la meta de renta por dividendos (decisión del usuario; renta de otra naturaleza, no DGI).
- Whitelist de `/api/ajustes`: `cash_interest_rate` (0–20%), `dividends_to_cash` (bool).

### Dividendos en riesgo — SECTOR-AWARE (`calcDividendRisks` en lib/portfolio.js)
Cada señal muestra el **valor, el umbral y el porqué** (no solo una etiqueta). Las señales son sector-aware (`riskSector` local):
- **General/tech/consumo/salud**: payout FCF (>90/110%), deuda/EBITDA (>4/5×), cobertura de intereses (<3/2×), FCF en descenso (<−5/−15%).
- **REITs**: NO FCF/deuda-EBITDA; **payout sobre AFFO** (`payout_affo`, >95/110%). AFFO = FFO − capex de mantenimiento por sub-tipo (reutiliza `reit_manual` del dashboard).
- **BDC**: **payout sobre NII** (`payout_nii` = ingresos de inversión − gastos op.; respaldo a BPA), >100/120%.
- **Banca/seguros**: ninguna señal de FCF/deuda (no aplican; se evalúan en su ficha).
- **Utilities**: umbral de deuda más alto (>6/7×), sin FCF. **Energía/materiales**: FCF en descenso solo si severo (<−25%).
- Columnas `payout_affo`/`payout_nii` en company_fundamentals (SQL `payout_affo_nii.sql`): NII lo calcula `update_fundamentals.py` (semanal); AFFO lo calcula `scripts/recalc_payout_affo_nii.mjs` (reutiliza `lib/reit-metrics` → sin drift; re-ejecutar tras editar sub-tipos o nuevas cuentas). La cartera tolera que las columnas no existan (fallback en el select).

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

## Fiscalidad de dividendos — retención en origen + doble imposición
- **Retención en origen por país**: `WHT_DEFAULTS` (ISO-2 → %) en `lib/sectors.js`, fuente única. Cubre los 36 países del universo (TR, MX, CL, PL, CZ, GR, AR, IN, KR, HU, TW, LU, EG… antes caían a 0). `getWHT(country, overrides)` en `lib/screener.js`.
- **Overrides por usuario/bróker**: `user_settings.wht_overrides` (jsonb `{CODE:%}`) — algunos brókers (IB) aplican el tipo de convenio, otros el completo. Se editan en **Ajustes → Fiscalidad** (`AjustesGlobalPage.js`, sección "retenciones") junto al impuesto de destino `dest_wht`. SQL: `webapp/sql/wht_overrides.sql` (**pendiente de ejecutar**: `wht_overrides` + `dest_wht`). Guardado vía `/api/ajustes` (whitelist + `sanitizeWhtOverrides`, 0-60%).
- **Doble imposición (ley española)**: el crédito por retención en origen se acredita **solo hasta el 15% del bruto**; el exceso NO es deducible. Helper único `effectiveDivTax(origen, destino, isDomestic)` en `lib/screener.js`: `total = origen + destino − min(origen, 15, destino)`; acción nacional (`code==='ES'`) → solo el impuesto español. Lo usan `netYield`/`netYieldOf`/`project10y`/`paybackYear`/`rentaScore` (screener, comparador, rankings, construir-cartera, ficha) y `calcFiscal` (coste fiscal de la cartera) y `buildDividendCalendar`. El resumen fiscal formal (`buildFiscalSummary`, casillas) ya topaba al 15%.
- Threading de overrides: `app/screener/page.js`→`ScreenerClient`, `PortfolioPage`/`CalendarioPage` (cartera), ficha (`country==='ES'`). Los scores compartidos del servidor (`calcDivQuality`, build-plan) usan los defaults.

## Tipos de cambio / FX (tabla exchange_rates) — FUENTE ÚNICA DE DIVISA
- Tabla `exchange_rates` (SQL en `webapp/sql/fx_and_settings.sql`): pares de divisa por fecha.
- `lib/currency.js`: `getExchangeRate(from, to, date)` (mira hasta 5 días hábiles atrás, null si no hay), `getLatestExchangeRate`, `getExchangeRateChange`, `convertAmount`, `formatCurrency`. Crea el cliente supabase de navegador internamente.
- Usado en alta de operación, posiciones, historial, ajustes (widget FX + alerta de comisión + análisis de divisa).
- El script de precios también puebla exchange_rates.
- **Peniques (GBp) de la Bolsa de Londres**: las acciones `.L` cotizan en PENIQUES y Yahoo las etiqueta como GBP, pero el usuario introduce el precio de compra en LIBRAS y el FX es GBP→EUR. `normalizeGbp(value, ticker, currency)`/`penceToPounds(ticker)` en `lib/portfolio.js` dividen /100 el `current_price` y el `dps` de las acciones `.L` en GBP dentro de `enrichPositions` → casan con `avg_cost` (libras) y el cambio. Sin esto el YoC salía ×100 (caso 4imprint FOUR.L: ~1033%) y el valor/ganancia inflados. `lib/dividend-calendar.js` también /100 los respaldos desde `div_history` (crudo, peniques) para `.L` (`pos.dps` ya viene normalizado de enrichPositions, NO se reescala). Solo afecta a la cartera (la ficha/screener usan peniques de forma consistente). Test `webapp/test/gbp-pence.test.mjs`.

## Sistema de valoración (lib/valuation.js) — sector-aware
- Valor intrínseco sector-aware. `computeValuation(data, moatWidth, type, currency)` y `recomputeValuation(engine, params, price)` (modo personalizado en cliente). Motores (`engine`): `dcf`, `epb`, `affo`, `ddm` (legacy, conservado para params guardados).
- **Por sector** (un DCF de FCF clásico NO sirve fuera de industrials/consumer/health):
  - **General** (consumo, salud, industrial, tech, comms): DCF sobre **FCFF** (no apalancado) con **FCF NORMALIZADO** (media de los últimos años). **Puente EV→Equity**: el DCF da Enterprise Value → se resta la **deuda neta** (+minoritarios) → equity → /acciones. Para no duplicar/ignorar la deuda según el estándar contable: en **US-GAAP** el FCF de Yahoo es post-intereses (apalancado) → se le suman los **intereses netos de impuestos** para volverlo FCFF (el add-back compensa la resta de deuda → US apenas cambia); en **IFRS** se asume ya no apalancado (no se suma) → la resta de deuda corrige el sobre-valor (p.ej. Ahold). Detección US por **ticker sin sufijo** (el campo `country` viene como nombre completo, no sirve para comparar con 'US'). Descuento (≈WACC) por foso, terminal 2,5-3%, crecimiento = media(fcf_cagr5, revenue_cagr5). Mismo puente en farma y energía; utilities (CFO) también resta deuda neta. Espejo en `update_fundamentals.py` + `recalc_valuation.py` (ya re-ejecutado).
  - **CAGR robusto a año de inicio deprimido** (`adjustedCagr` en JS / `_adjusted_cagr` en Python): al calcular el crecimiento blended, si el año más ANTIGUO de la ventana de FCF/ingresos es un outlier (>1,5 desv. por debajo de la tendencia de los demás años) se EXCLUYE del CAGR (no del FCF base normalizado, que sí suaviza ciclo). Evita que un año deprimido por inflación de costes infle el crecimiento (Colgate: FCF CAGR 25%→~9%, valor 149→84). Mismo principio que las cíclicas de materiales pero con ciclo de márgenes.
  - **Ajuste por arrendamientos (IFRS 16)**: en no-US el FCF de Yahoo excluye el principal del lease (va a financiación) → infla el FCF de retailers (Dunelm, Ahold). Se **resta el principal anual del lease** (porción corriente de `Capital Lease Obligations`) al FCF base para reflejar el coste recurrente real, y se **excluye la obligación total de leases de la deuda neta** (el `Total Debt` la engloba) para no contarla dos veces. En US-GAAP los leases operativos ya están en el OCF → no se resta del FCF (pero también se excluye la obligación de la deuda neta). Sin el ajuste, la perpetuidad del DCF daba beneficio perpetuo de las tiendas alquiladas restando solo la obligación finita (Dunelm pasaba de +45% a +20% de MoS).
  - **Bancos y aseguradoras**: NO DCF. **Modelo de exceso de retorno / P/B justificado** (`excessReturnPB`, engine `epb`): `Valor = BVPS × (ROE − g) / (Ke − g)`. Compara el P/B que merece la entidad por su ROE con el de mercado. Robusto: BVPS desde P/B o patrimonio/acciones; **Ke con prima de riesgo país/divisa** (`EQUITY_RISK_PREMIUM`: MXN/BRL +5%… → sin ella Banorte salía +120%); g acotado a Ke−4% (evita que el Gordon explote al acercarse g→Ke); **P/B justificado capeado a 0,3–3×**. En **aseguradoras** el ROE se amortigua a tope 14% (un ROE alto suele venir del resultado de inversión, no del negocio técnico) + warning de "sin combined ratio". Resultados de referencia: Banorte −15%, BNP +17%, JPM −17%, Munich Re +36%, Allianz +2%.
  - **REITs**: Múltiplo AFFO (no DCF de FCF; la amortización inmobiliaria rompe el FCF contable).
  - **Utilities**: DCF·CFO (CFO en vez de FCF por el capex regulado; horizonte largo, WACC baja).
  - **Farmacéuticas**: DCF·Prima riesgo (descuento mayor por pipeline, −1pp si I+D>20%).
  - **Energía / materiales (cíclicos)**: DCF·Normalizado (FCF medio del ciclo, no el último año → evita Freeport).
  - **Holdings / trusts / partnerships** (Brookfield Infra `-UN`, Wendel, investment trusts): `detectComplexStructure` → valoración **NO disponible "estructura compleja"** (su valor es suma de partes / NAV, no un DCF; evita el +401% de BIP). Detección por industria (holding+financiero), sufijo de ticker `-UN`, nombre (partners L.P.).
- **Cap de cordura** (en `computeValuation`): si tras el modelo el `mos > 80%` o `< −85%`, se marca `available:false` "valoración no fiable para este sector/modelo" (red de seguridad ante cualquier outlier nuevo). Espejo en el screener: `mosUnreliable` (`MOS_UNRELIABLE=80` en `lib/screener.js`) + payout >150% en insights se marca "base no representativa".
- Otras correcciones: penalización al descuento por ingresos en declive; terminal 0 si 3+ años de caída.
- Inputs editables por el usuario en la ficha (modo automático/personalizado, persistencia en localStorage). `editableFor`/`recomputeValuation` soportan los 4 engines.
- El script Python precalcula `intrinsic_value`, `valuation_warning`, `growth_input_used` (lo lee el SCREENER/comparador). `update_fundamentals.py` (`compute_valuation`) **replica los modelos nuevos** (exceso de retorno banca/seguros con prima país, exclusión de holdings/`-UN`, FCF normalizado en general) — espejo de `lib/valuation.js`, verificado idéntico (Banorte −15, BNP +17, Munich Re +36…). Acepta etiquetas de línea en inglés (yfinance) y español (jsonb).
- **Foso alineado screener↔ficha**: `update_fundamentals.py` (`compute_moat_width`) replica EXACTAMENTE el `computeMoat` de `lib/company-detail.js` (ramas banca/seguros por ROE+escala+racha, REITs por escala+rentas+margen+racha, general por ROIC+márgenes+FCF, cap de telecos a estrecho) y se lo pasa a `compute_valuation`. Así el `intrinsic_value`/MoS del screener coincide con el de la ficha (antes el screener usaba un heurístico roic/streak más burdo).
- `scripts/recalc_valuation.py` — recalc de una vez del `intrinsic_value` en BD desde los estados ya guardados (sin yfinance), reutilizando `compute_valuation` + `compute_moat_width`. Dry-run por defecto; `--write` persiste en lotes; `--ticker X` para una. Ya ejecutado (1889 valoradas / 605 NA; antes 1287 sin valor). Divisa por sufijo de ticker.

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
- **Alerta "avísame cuando sea COMPRA"** (`alert_buyzone_active`/`_triggered`, SQL `watchlist_buyzone.sql`): toggle en el modal de seguir; sin precio manual, avisa cuando entra en zona de compra por **Score DGI ≥ 6,5 Y margen de seguridad ≥ 20%** (el cron lee el último Score de `score_history` + `intrinsic_value`). Notificación `watchlist_buyzone` (🟢) in-app + email premium.
- **Freemium**: gratuito hasta 10 empresas, sin alertas por email (pero sí notificación in-app); premium ilimitado + email.
- También genera notificación `recurring` al ejecutarse una aportación periódica (en `/api/procesar-aportaciones`).
- **Detector de cambios de dividendo** (`/api/check-dividend-changes`, cron lunes 8:00 UTC en `vercel.json`): en una pasada detecta **recortes** (último año completo con crecimiento<0, `lastYear>=año-2` → `dividend_cut`) y **subidas** (crecimiento>0,5%, `lastYear>=año-1` → `dividend_increase`, el evento que celebra el DGI: "tu YoC sube"). Avisa a quien la TIENE (positions) o la SIGUE (watchlist). In-app siempre + email (Resend) solo premium. Dedup: 1 aviso por usuario+ticker+tipo al año. Iconos en `NotificationsClient`/`NotificationBell` (⚠️ recorte, 📈 subida). CRON_SECRET opcional.

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
- **Seguridad del dividendo (0–100)** en la tarjeta del screener + **filtro premium** "Seguridad div." (≥50/≥70/≥85): calculada server-side en `buildScreenerCompanies` con `dividendSafety` (solo el número viaja al cliente como `co.safety`). Ver "Seguridad del dividendo".
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
- **Inventario vs ventas en el Score DGI** (`exInventorySignal`/`inventoryScore` en `dgi-score.js`, categoría **Calidad del negocio**): señal forense = CAGR del **inventario** vs CAGR de las **ventas** a 3 años (suaviza el interanual y la acumulación estratégica de cíclicas). Inventario creciendo bastante más rápido que ventas (gap +) → alerta de demanda débil/obsolescencia que anticipa caídas de margen. El **gap es comparable entre sectores** (un súper rota 15× y una relojería 1×, pero ambos con gap ~0 si el stock sigue a las ventas) → no necesita percentil sectorial. **Solo se añade si la empresa tiene inventario MATERIAL** (`inventario/ventas ≥ 2%`); software/servicios/banca/seguros/REITs/utilities quedan excluidos automáticamente (no se muestra "—" ni penaliza). Verificado: Inditex gap −6pp→10, Lam Research +1pp→6, Microsoft excluido.
- **Precio del día en la ficha**: el valor intrínseco/MoS, Score y salud se calculan con el **precio real diario** (`daily_prices`/cotización), no con el del scrape semanal — `app/empresa/[ticker]/page.js` fija `detail.current_price = price` (vivo) antes de `computeValuation`/`computeMoat`/`computeDGIScore`. El screener/snapshot siguen con el precio de scrape (batch).
- **Disciplina de acciones (dilución) en el Score DGI** (`buildFinancial` en `dgi-score.js`, categoría **Solidez financiera**): métrica "Disciplina de acciones" = CAGR anual del nº de acciones desde `shares_reduced_pct`/`shares_base_year` (`exSharesAnnual`: + = dilución, − = recompra). Puntuación **sector-aware** (`dilutionScore`): general/tech → recompra premia, dilución por SBC penaliza (>4%/año → 1); banca/seguros → la emisión es alarma de recapitalización forzada (penaliza pronto); **REITs → se juzga por si el FFO/acción crece pese a la emisión** (acretiva, vía `secM.ffoCagr5`), no por el nº de acciones en bruto (emitir es su modelo). No requiere datos nuevos (usa columnas ya pobladas).

## Clasificación DGI por racha (Reyes/Aristócratas/Aspirantes)
- **Fuente única** en `lib/helpers.js`: `DIVIDEND_TIERS` (array) + `dividendTier(streak)` (devuelve id `rey`/`aristocrata`/`aspirante`/null) + `dividendTierInfo(streak)` (objeto del nivel) + `streakBadge(streak)` (solo el emoji). Umbrales: **Rey 👑 ≥50 · Aristócrata 🏆 25–49 · Aspirante ⭐ 10–24** (colores #fbbf24/#a78bfa/#60a5fa).
- **La racha solo cuenta INCREMENTOS reales** (`growth > 0`): un dividendo congelado (growth = 0) o recortado la rompe (antes contaba `>= 0`, inflando rachas de empresas estancadas como Telefónica). En `compute_streak` (`update_fundamentals.py`) y recalculado en BD con `scripts/recalc_streak.mjs --write` (561 empresas corregidas).
- **Tendencia negativa del dividendo** (`dividendTrend` + `dividendTrendBadges` en `lib/helpers.js`, desde `div_history`): cuando no hay racha positiva, badges/insights "N años bajando el dividendo" (caída), "N años sin subir (congelado)" y "N recortes en los últimos 10 años" (cuts10≥3). En la ficha: badges de cabecera (`computeBadges`), línea del Historial de dividendos (`DividendHistorySection`) e insights (`buildInsights`). El screener solo usa `div_streak` (sin historial), así que estas empresas simplemente pierden su tier.
- **Penalización en el Score DGI** (`buildPenalties` en `dgi-score.js`, usa `dividendTrend`): dividendo en caída o ≥3 recortes en 10 años → **−1,0**; solo congelado ≥2 años → **−0,4** (con tope, no acumula; reemplaza la antigua "recorte reciente −0,5"). Nota: distinto del CDR/recompras-con-caja, que NO penaliza.
- Reemplazó las medallas/etiquetas antiguas inconsistentes (🥇🥈🥉, "Campeón DGI") en TODA la app: screener, comparador, ficha de empresa (`streakBadge` local + `computeBadges`/insights en `lib/company-detail.js`), índices y CompanyRow.
- Página `/aristocratas`: `app/aristocratas/page.js` (server, reutiliza patrón del screener: dict + company_fundamentals) → `components/AristocratasClient.js`. Tres niveles con contador, buscador, filtro por continente y toggle "solo zona de compra". Freemium: niveles+contadores y 5 primeras por nivel visibles, resto tras CTA. Entrada "Aristócratas" en `NavMenu` entre Screener y Watchlist.

## Banca — métricas y scoring propios (`lib/bank-metrics.js`)
- En banca NO se usan **EBITDA, FCF ni ROIC** (no aplican). Métricas propias, calculadas desde los estados ya guardados (`company_fundamentals.*_annual`, claves inglesas de Yahoo):
  - **BPA diluido + CAGR 5a** (`Diluted EPS`).
  - **NIM proxy** = `Net Interest Income / Total Assets` (no es el NIM real pero es comparable entre bancos).
  - **ROTE** = Beneficio neto / patrimonio tangible (`Tangible Book Value` de Yahoo, o equity − goodwill − intangibles).
  - **Ratio de eficiencia** = costes operativos (`Operating Expense`/SG&A) / ingresos netos bancarios (`Total Revenue`).
- **NPL (morosidad)**: SIEMPRE manual, por trimestre. Tabla `bank_metrics_manual` (ticker, period 'YYYYQn', npl, nim, rote, efficiency). Mientras no se rellene → la ficha muestra **"–"** (nunca 0/null). NIM/ROTE/eficiencia también admiten **override** manual cuando Yahoo no tiene desglose (bancos pequeños). `effectiveBankMetrics(computed, manualRows)` combina (override del trimestre más reciente gana; NPL solo manual).
- **Editor**: Dashboard → Datos → pestaña **"Banca"** (`components/dashboard/BankMetricsClient.js`) + API `/api/admin/bank-metrics` (GET/POST/DELETE, admin).
- **Ficha** (`isBank` → `BankMetricsCard`): sustituye a la tarjeta ROIC; muestra las 5 métricas + NPL. Premium-gated.
- **Score DGI** (`computeDGIScore(..., bankOverride)`): banca recalculado — Calidad = ROTE 0.35 / NIM 0.25 / CAGR BPA 0.25 / ROE 0.15; Solidez = eficiencia 0.35 / NPL 0.25 (solo puntúa si está relleno, `catScore` redistribuye su peso) / crecimiento ingresos 0.20 / ROA 0.20. La ficha pasa el NPL/overrides; el snapshot (`select('*')`) calcula desde los estados.

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
- **Conceder/revocar Premium con fecha de fin** (Usuarios → "Ver detalle" → "Gestionar premium"): datepicker "premium hasta" + casilla "sin caducidad" (permanente) + botones conceder/actualizar/revocar. API `/api/admin/grant-premium` (POST, admin-guarded, service_role: `{email, premiumUntil, revoke}`). La caducidad se respeta sola (la app marca free si `premium_until < hoy`).
- **Alta de empresas nuevas con búsqueda** (Datos → gestión del DICT, `DictManagerClient.js`): se escribe un ticker de Yahoo y se pulsa **Buscar** → `/api/admin/fetch-ticker` comprueba si ya está en el DICT efectivo (`getEffectiveDict`), descarga de Yahoo (módulo `assetProfile` incl.) y **prerrellena** nombre, divisa, país (ISO-2 por nombre de país inglés o sufijo de bolsa), sector, industria y `type` inferido (banco/aseguradora/reit/utilities por sector). Guarda los escalares en `company_fundamentals` (y sector/industria/país si la empresa es NUEVA). El admin revisa y pulsa **Añadir al DICT** (`dict_overrides` action='add'). El run semanal (`update_fundamentals.py` → `load_override_tickers`) **incluye los tickers añadidos por overrides** (y excluye los 'remove') → la empresa nueva recibe los estados financieros completos en el siguiente run.
- API admin: `/api/admin/fetch-ticker`, `/api/admin/trigger-github-action`, `/api/admin/clean-logs`, `/api/admin/grant-premium`.
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

## Seguridad del dividendo (0–100) — `lib/dividend-safety.js`
Nota PREDICTIVA del riesgo de recorte (complementa al detector reactivo y al Score DGI). Pura, testeada. `dividendSafety(data, sectorType)` → `{available, score, grade, color, factors[]}`. Ponderación: payout 35% (bandas por sector: REIT/utility toleran más), solidez del balance 25% (deuda/EBITDA + cobertura), historial 15% (racha), tendencia 25% (subidas suman; recortes/congelación restan). Grado Muy seguro/Seguro/Vigilar/En riesgo/Peligro (`safetyGrade`). Se usa en: **ficha** (tarjeta "Seguridad del dividendo", premium, solo si paga dividendo) y **screener** (columna + filtro, `co.safety`).

## Novedades (`/novedades`) — home de registrados
- `app/novedades/page.js` (server) → **`components/PortfolioHome.js`** (panel personal de la cartera, arriba) + `components/NovedadesClient.js` (feed de mercado, debajo). El **proxy** redirige `/`→`/novedades` para usuarios con sesión (el anónimo ve la landing). `/novedades` está en `ONBOARD_ROUTES`.
- **PortfolioHome** (client, carga la cartera como PortfolioPage: posiciones+fundamentales+precios+ajustes+liquidez+notificaciones+FX). 5 bloques centrados en interés compuesto y progreso:
  1. **Hero**: valor total + **Contador de Libertad Financiera** (`avgMonthlyPassive / monthly_expenses`, con barra) + ingresos pasivos estimados del mes desglosados en **dividendos** (mes actual del `buildDividendCalendar`) + **intereses** (`estimateMonthInterest`). `monthly_expenses` editable inline (user_settings vía `/api/ajustes`, SQL `monthly_expenses.sql`).
  2. **Pólvora seca**: saldo del fondo de oportunidad + intereses mensuales acumulados (de `/api/cartera/liquidez`).
  3. **Calendario**: mini-barras de renta neta por mes (mes actual resaltado) + tarjeta **Próximo Payday** (`cal.nextPayment`: días restantes, logo, importe neto).
  4. **Tu actividad**: timeline de eventos — **compras/ventas** (`transactions`), **ingresos/retiradas de liquidez** (`cash_movements` deposit/withdraw), cobros recientes (`dividends_received`), subidas/recortes/zona de compra (notificaciones) y **ex-dividend próximos** (`next_ex_date` ≤10d). Ordenado por fecha desc, 10 últimos.
  5. **Salud**: YoC vs yield actual + **termómetro de payout medio** (saneado, ponderado por valor; verde<60 / ámbar<80 / rojo).
  - Reutiliza `enrichPositions`/`calcSummary`/`calcFiscal` (portfolio), `buildDividendCalendar` (dividend-calendar), `estimateMonthInterest` (cash-fund). Estado vacío (sin posiciones) → bienvenida + CTA a construir/añadir.
- **Resultados recientes**: empresas cuya última publicación de resultados cae en los últimos 35 días, por **fecha de publicación real** (`last_report_date`) con respaldo a estimación (cierre de trimestre + 35d). Bloque destacado con mini-gráfico de ingresos por trimestre + cambio YoY de ingresos y beneficio; reparto **mitad 🇺🇸 / mitad país del usuario** (`country_residence`), priorizado por capitalización (`splitFeatured`). Listado del resto.
- **En tu cartera y watchlist**: notificaciones recientes (recortes/subidas/zona de compra).
- Lógica pura en `lib/novedades.js` (`parseQuarterlyNews`, `splitFeatured`, `daysSince`, `effectiveReportDate`). Detección de "ha presentado resultados": `update_fundamentals.py` (`compute_report_date`) marca `last_report_date=hoy` al aparecer un trimestre NUEVO (granularidad del run semanal); columnas `last_report_period`/`last_report_date` (SQL `report_dates.sql`), backfill `scripts/backfill_report_dates.mjs`.

## Analítica de producto — PostHog (`components/Analytics.js` + `lib/analytics.js`)
Snippet oficial de PostHog cargado SOLO si existe `NEXT_PUBLIC_POSTHOG_KEY` (no-op total si falta → no rompe local/preview). Autocapture (pageviews + clics). `track(event, props)`/`identify` para eventos clave; se marca `upgrade_click` en el inicio de checkout (`PricingClient`). Host EU por defecto (`NEXT_PUBLIC_POSTHOG_HOST`). Montado en `app/layout.js`. PENDIENTE: poner la key en Vercel.

## Tema claro/oscuro
- **Oscuro por defecto**; toggle SOLO en **Ajustes → Apariencia** (no en el menú, por decisión del usuario). Persiste en `localStorage` (`theme`), funciona para anónimos.
- **Variables de tema** en el `<style>` inline de `app/layout.js` (NO en globals.css, que está SIN importar = código muerto): `:root` = oscuro, `[data-theme="light"]` = claro. Tokens: `--bg`, `--bg-elev`, `--surface`(-2/-3), `--border`(-strong), `--text-strong`/`--text`/`--text-muted`/`--text-faint`/`--text-faintest`, `--accent`(-bg), `--positive`/`--positive-soft`/`--negative`/`--warning`, `--nav-bg`, `--scrollbar`.
- **Anti-parpadeo**: script inline en `<head>` fija `data-theme` antes del primer paint. `components/ThemeToggle.js` exporta `useTheme()` + `applyTheme()`.
- **Regla al escribir UI nueva**: usar `var(--token)` para chrome (fondos/bordes/textos); en oscuro las variables = valores originales (sin regresión). Acentos de datos de gráficos (p.ej. `#60a5fa`) y emails (`app/api/*`) se dejan en hex. La migración masiva se hizo con un codemod (hex/rgba→var) que excluye `layout.js`/`manifest.js`/`ThemeToggle.js`.
- **`var()` NO se resuelve en atributos de presentación SVG** (`fill=`/`stroke=`) en algunos navegadores → caía a negro (gráficos oscuros en claro). Solución: reglas CSS `[fill="var(--x)"]{fill:var(--x)}` (y stroke) en el layout, que SÍ resuelven var() y ganan al atributo → tematiza todos los SVG sin tocar componentes. **html2canvas tampoco resuelve var()** → en exports (ComparadorClient) se lee el valor real con `getComputedStyle`.

## Logos de empresa (auto-alojados)
- Bucket público de Supabase Storage **`company-logos`** (`{ticker}.png`), poblado por `scripts/fetch_logos.mjs` (descarga del CDN de FMP `images.financialmodelingprep.com/symbol/{toFmpSymbol}.png`, valida PNG, salta secundarias; ~2128/2490 = ~88% cubiertas, ~15-20 MB). Re-ejecutable.
- Componente **`components/CompanyLogo.js`** (`<img>` desde el bucket; `onError` → monograma circular con iniciales + color del nombre, nunca icono roto; logo sobre chip blanco para verse en ambos temas). **OJO**: `NEXT_PUBLIC_SUPABASE_URL` en Vercel tenía espacios al final → se sanea con `.trim()`.
- Integrado en: cabecera de la **ficha**, tabla de **posiciones** de la cartera, **recomendación de empresas** (CompanyDetector) y **watchlist**.

## Estimaciones de analistas + diagrama Sankey (pestaña Finanzas de la ficha)
- **Estimaciones de analistas (FMP)** (`components/empresa/AnalystEstimates.js` + `lib/analyst-estimates.js` + `app/api/empresa/[ticker]/estimates`): tabla + gráfico combinado (barras de ingresos + línea de BPA, real sólido / estimado discontinuo) con un continuo años reales (de `income_statement_annual`) → estimados (consenso FMP). Ingresos en millones (M), como el resto de la app. La **fuente (FMP) se oculta** a propósito en la UI.
  - **Endpoint**: API "stable" `/stable/analyst-estimates?symbol=…&period=annual` (la v3 legacy da **403** a cuentas creadas tras 31-ago-2025). Campos `revenueAvg`/`epsAvg`/`numAnalystsEps`. `toFmpSymbol` convierte el ticker Yahoo→FMP.
  - **Plan free de FMP cubre CASI SOLO EE.UU.**: no-US (p.ej. `CLNX.MC`) devuelve **HTTP 402** → no es bug, es el plan. `fetchFmpEstimatesResult` discrimina `ok`/`unsupported`(402)/`error`(transitorio).
  - **Precarga por lotes**: `scripts/fetch_analyst_estimates.mjs` (+ workflow diario `fetch_analyst_estimates.yml`, 7:00 UTC, cap 200/día → cubre la app en ~10 días) rellena `analyst_estimates`/`_status`/`_at` en company_fundamentals. `unsupported`/vacío → `none` (no se reconsulta); `error` → reintento. La ruta lee de BD primero (0 llamadas) y solo hace fetch en vivo si `status` es null. SQL `webapp/sql/analyst_estimates.sql`. `FMP_API_KEY` en Vercel (3 entornos) **y** como secret de GitHub Actions.
  - **Decisión editorial**: NO mostramos precio objetivo de analistas (cortoplacista, choca con DGI) — hay un párrafo explicándolo al pie de la pestaña Valoración. FMP sí lo daría (price-target/grades, solo US).
- **Diagrama Sankey del estado de resultados** (`components/empresa/IncomeSankey.js`): "¿A dónde va el dinero?" — SVG propio con layout determinista (beneficio arriba / coste-gasto abajo en todas las columnas → sin cruces; recharts Sankey se descartó por entremezclar flujos). Ingresos → Coste de ventas + Beneficio bruto → Beneficio neto + Gastos → I+D / Ventas y marketing / G&A / Impuestos y otros. **Selector de periodo** arriba (años; trimestres si hay datos = premium). Solo estructura clásica con beneficio positivo (banca/seguros/REIT y pérdidas → no se muestra).

## PWA / instalable
`app/manifest.js` (Next sirve `/manifest.webmanifest` y enlaza solo) + iconos SVG de marca: `app/icon.svg` (favicon), `public/icon.svg` + `public/icon-maskable.svg` (manifest), `app/apple-icon.svg`. "Añadir a pantalla de inicio" con arranque propio.

## Error boundaries + SEO
- `app/error.js` y `app/global-error.js` (Client Components; prop `unstable_retry` de Next 16, fallback a `reset`) → un throw ya no deja pantalla en blanco. `app/not-found.js` (404 con marca). Loguean a consola (placeholder de Sentry/PostHog).
- `app/sitemap.js` (~2000 fichas sin secundarias + índices + páginas públicas) y `app/robots.js` (bloquea `/api` y páginas privadas/de app). `generateMetadata` en `/mercados/[symbol]`.

## Tests + CI — runner nativo de Node (cero dependencias)
`npm test` → `node --import ./test/register-alias.mjs --test "test/**/*.test.mjs"`. `test/alias-resolver.mjs` mapea el alias `@/` e imports relativos sin extensión para cargar los `lib/` sin Next. Cubre la lógica financiera crítica: `fiscal-es` (tramos/exención/resolveDestWHT), `screener.effectiveDivTax` (doble imposición 15%), `helpers` (tiers/dividendTrend), `metrics.calculateROIC`, `dividend-safety`, `novedades`, `portfolio.calcDividendRisks` (sector-aware), `analyst-estimates` (toFmpSymbol/buildEstimateSeries), `gbp-pence` (normalización peniques `.L`). 56 tests. CI en `.github/workflows/test.yml`.

## Healthcheck de frescura de datos (Dashboard → Sistema)
`/api/admin/data-health` + tarjeta "Salud de los datos": comprueba cada fuente y **cada benchmark por separado** (el indicador global no detectaba una serie congelada — caso ^GSPC parado 13 meses). Verde/ámbar/rojo por antigüedad según cadencia. NOTA: los índices benchmark (`^GSPC`…) se reincorporaron a `update_prices.py` (`BENCHMARK_TICKERS`) — `get_all_tickers()` no los incluía y dejaron de actualizarse.

## Limpieza de código muerto / seguridad
Se eliminó el shell legacy NO montado: `DgiApp`+`IndexTab`+`CarteraTab`+`SettingsPage`+`UpgradeModal`, y los endpoints `/api/settings` (POST hacía `upsert` de user_settings SIN whitelist → riesgo de escalada; solo lo salvaba la RLS sin policy UPDATE), `/api/portfolio` (sin uso) y `/api/news/*` + componentes de noticias. Toda escritura de ajustes pasa por `/api/ajustes` (service_role + whitelist).

## Infraestructura / despliegue
- Repo GitHub: rama por defecto **master** (la app vive ahí); `main` es el proyecto HTML original + funds.json de GitHub Pages (historiales independientes).
- Deploy: Vercel proyecto `invest-dgi`, dominio https://invest-dgi.vercel.app. Deploy con `cd webapp && vercel --prod --yes`.
- GitHub Action `update_fundamentals.yml` corre `scripts/update_fundamentals.py` (domingos 6:00 UTC + manual). Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
- GitHub Action de precios corre `scripts/update_prices.py` (daily_prices + exchange_rates + benchmarks).
- El script de fundamentals: pausa 1.5s/ticker (evita rate-limit de yfinance), `is_fresh` reintenta filas stub (current_price/revenue_cagr5 nulos), escribe en admin_logs, actualiza también la tabla `funds` (`update_funds`).
- NOTA: `update_fundamentals.py` NO tiene flag `--half` (asumirlo rompió update_all.yml en el pasado; ya corregido).

## SQL pendiente de ejecutar en Supabase (todos los ficheros en webapp/sql/)
Estado: el usuario ya ejecutó admin.sql, valuation_columns.sql, roic_columns.sql, cartera_parte3.sql, funds.sql, recurring.sql, fx_and_settings.sql, daily_prices.sql, `investor_profile.sql`, `taxonomy_locked.sql`, y (esta sesión) `watchlist_buyzone.sql`, `income_goal.sql`, `report_dates.sql` y `payout_affo_nii.sql` (estos 4 confirmados ejecutados + backfills corridos).
Ficheros que el usuario PUEDE tener aún pendientes de ejecutar (confirmar en entorno nuevo):
`roic_display.sql`, `funds_returns.sql` (incl. benchmark_name), `cancellations.sql`, `onboarding.sql`, `watchlist.sql` (tablas watchlist + notifications), `yield_avg.sql` (columnas yield_avg + yield_avg_years), `ma200.sql` (columna MM200), `score_history.sql` (tabla de histórico del Score DGI), `canibales.sql` (columnas shares_reduced_pct + shares_base_year), `compounders.sql` (columna capex_cfo_pct), `bank_metrics.sql` (tabla bank_metrics_manual — NPL/overrides bancarios por trimestre), `analyst_estimates.sql` (columnas analyst_estimates + _status + _at — necesario antes de correr fetch_analyst_estimates.mjs/workflow), `positions_commission.sql` (columna positions.commission — override de comisión por posición desde el editor de la cartera), `cash_fund.sql` (tabla cash_movements + columnas user_settings.cash_interest_rate/dividends_to_cash — Fondo de oportunidad), `monthly_expenses.sql` (columna user_settings.monthly_expenses — contador de libertad de la home), y el ALTER de `premium_until` en user_settings. NOTA: el bucket de Storage `company-logos` ya está creado por `fetch_logos.mjs` (no es SQL).
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
precio, dps, div_streak, div_cagr5, div_history, payout_fcf, payout_eps, payout_nii (BDC), payout_affo (REIT),
last_report_period, last_report_date (fecha de publicación de resultados → Novedades),
fcf_per_share, fcf_cagr5, debt_ebitda, net_debt, net_debt_ebitda,
interest_coverage, roic (legacy), roic_reported, roic_tangible, roic_display, roic_warning,
nopat, invested_capital, invested_capital_tangible, tax_rate_effective,
intrinsic_value, valuation_warning, growth_input_used,
roe, roa, operating_margin, net_margin, gross_margin,
current_ratio, revenue_cagr5, pe_trailing, pe_forward, ev_ebitda, beta,
week52_high, week52_low, yield_avg, yield_avg_years, ma200, shares_reduced_pct, shares_base_year, capex_cfo_pct, market_cap_m, sector, industry, taxonomy_locked, country,
income_statement_annual, balance_sheet_annual, cashflow_annual,
income_statement_quarterly, balance_sheet_quarterly, cashflow_quarterly,
analyst_estimates (jsonb), analyst_estimates_status ('ok'/'none'), analyst_estimates_at,
updated_at

## Scripts Python (scripts/) — YA CREADOS
- `update_fundamentals.py` — descarga yfinance de ~2000 empresas, calcula métricas (ROIC con la fórmula nueva, div_streak, div_cagr5, payout_fcf, net_debt_ebitda…), estados financieros 4 años anuales+trimestrales traducidos al español, upsert en Supabase via service role, NaN/Infinity→None.
  - **Dividendo / dps** (fuente del yield): `dps` = **dividendo del último año COMPLETO de `div_history`** (no `isPartial`), porque está en la MISMA unidad que el precio (p.ej. peniques en las `.L`) y es el reparto real. `info.dividendRate` solo como respaldo si no hay año completo: en muchas `.L` viene en libras (×100 de desajuste → yield 0,02%) o incluye specials/timing (p.ej. Ageas 4,5 vs 3,5 → 6,7% en vez de 5,2%). NUNCA `lastDividendValue`. `pays_dividend=false` y `dps=None` si no repartió el año anterior ni en curso. Backfill: `scripts/fix_dps_from_history.mjs` (1133 empresas). Anti-artefacto: yield >40% se descarta (`scripts/fix_bad_yield.mjs`). Diagnóstico de salud: comparar `dps/price` contra `yield_avg`.
  - **Yield histórico medio** (`compute_yield_avg`): calcula `yield_avg`/`yield_avg_years` desde `div_history` + `tk.history(period="6y", auto_adjust=False)` (media de hasta 5 años completos). Es la **fuente autoritativa** (cobertura total, divisa consistente con los dividendos). Alimenta la señal "zona de compra" del screener. ⚠️ requiere `yield_avg.sql` ejecutado antes del próximo run (si no, los upserts fallan).
  - **MM200** (`compute_ma200`): media de los últimos 200 cierres del mismo `tk.history`. Columna `ma200` (requiere `ma200.sql`). El backfill inmediato/total es `backfill_yield_avg_yahoo.py` (calcula yield_avg + MM200 a la vez para todas las empresas).
  - **payout_nii** (BDC): `dividendo / NII`, NII ≈ ingresos de inversión − gastos operativos (solo sector Financial Services). **last_report_date/period** (`compute_report_date`): marca la fecha al detectar un trimestre nuevo (Novedades).
- `update_prices.py` — daily_prices + exchange_rates + **benchmarks** (`BENCHMARK_TICKERS = ^GSPC,^STOXX,URTH,^NDX,^FTSE,^GDAXI,^N225`, reincorporados: `get_all_tickers()` no los incluía).
- `recalc_payout_affo_nii.mjs` (Node) — calcula `payout_affo` (REITs, reutilizando `lib/reit-metrics` → sin drift) y `payout_nii` (BDC) desde los estados ya guardados. `--write`. Re-ejecutar tras editar sub-tipos de REIT o nuevas cuentas. Ya ejecutado (104 REITs + 13 BDC).
- `backfill_report_dates.mjs` (Node) — pobla `last_report_period`/`last_report_date` desde los trimestres ya guardados (estimación cierre+35d). `--write`. Ya ejecutado.
- `recalc_roic.mjs` (Node) — recalcula ROIC en BD desde los estados ya guardados (sin yfinance). `--write` para persistir.
- `recalc_streak.mjs` (Node) — recalcula `div_streak` en BD desde `div_history` con la regla `growth > 0` (un congelamiento rompe la racha). `--write`. Ya ejecutado (561 empresas).
- `recalc_shares.mjs` (Node) — calcula `shares_reduced_pct`/`shares_base_year` (ranking de Caníbales) desde los estados ya guardados (Diluted Average Shares), sin yfinance. Descarta artefactos (|>50%| = split). `--write`. SQL: `webapp/sql/canibales.sql`. La fuente autoritativa ongoing es `update_fundamentals.py` (`compute_shares_reduction`).
- `recalc_capex_cfo.mjs` (Node) — calcula `capex_cfo_pct` (= CapEx/CFO medio, CFO = FCF+|CapEx|) para el ranking de Compounding, desde el cashflow ya guardado. `--write`. SQL: `webapp/sql/compounders.sql`. Ongoing: `compute_capex_cfo` en `update_fundamentals.py`.
- `fix_stale_dividends.mjs` (Node) — script de una vez: marca como que NO reparten (dps=null, pays_dividend=false) las empresas con dividendo obsoleto (sin reparto el año anterior ni en curso según `div_history`). Sin yfinance. `--write`. Ya ejecutado (142 empresas). Mismo patrón que `recalc_roic.mjs` (createRequire desde webapp).
- `fix_dps_from_history.mjs` (Node) — recalcula `dps` = dividendo del último año completo de `div_history` (misma unidad que el precio) para empresas que pagan. Corrige yields mal calculados por `info.dividendRate` (unidad libras/peniques en `.L`, specials). `--write`. Ya ejecutado (1133 empresas).
- `fix_bad_yield.mjs` (Node) — descarta el dividendo (o cae al último año completo) cuando el yield es absurdo (>40%, special/precio en céntimos). `--write`. Ya ejecutado (5 empresas). `fix_yield_trend.mjs` fue una versión previa (reconciliación por tendencia), englobada por `fix_dps_from_history.mjs`.
- `backfill_yield_avg_yahoo.py` (Python) — backfill de **cobertura total** de `yield_avg`/`yield_avg_years`: reutiliza el `div_history` ya en BD y descarga SOLO el histórico de precios de Yahoo en bloque (`yf.download` por lotes), sin correr el pipeline completo. Misma lógica que `compute_yield_avg`. Para poblar ya sin esperar al run semanal o re-poblar periódicamente. `--write` (upsert por bloques de 500), `--limit N`, `--ticker X`. Requiere `yield_avg.sql` ejecutado. (Nota: `daily_prices` NO sirve de fuente porque solo tiene profundidad para tickers charteados — `update_prices.py --history` no está cableado.)
- `fetch_analyst_estimates.mjs` (Node) — precarga `analyst_estimates`/`_status`/`_at` desde FMP (API stable), por capitalización, cap diario (`--limit`, def. 200). Marca `none` lo sin cobertura (402/vacío, no reconsulta), reintenta los `error` transitorios. `--recheck` reconsulta las `none`. Requiere `FMP_API_KEY` + `analyst_estimates.sql`. Workflow diario.
- `fetch_logos.mjs` (Node) — descarga logos del CDN de FMP al bucket público `company-logos` de Supabase Storage. Concurrencia 8, valida PNG, salta secundarias. `--limit N`, `--ticker X`. Ya ejecutado (~2128 logos).

## GitHub Actions (.github/workflows/) — YA CREADOS
- `update_fundamentals.yml` — domingos 6:00 UTC + manual. Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
- Workflow de precios para `update_prices.py`.
- `fetch_analyst_estimates.yml` — diario 7:00 UTC + manual (input `limit`). Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, **FMP_API_KEY** (este último también añadido como secret de GitHub Actions).

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
- **Hay tests** (`cd webapp && npm test`, runner nativo de Node, cero deps). Al tocar lógica pura de `lib/` (fiscalidad, scoring, valoración, riesgos, seguridad del dividendo) añadir/actualizar el test correspondiente en `webapp/test/`. CI los corre en cada push (`.github/workflows/test.yml`).

## Ficheros lib clave
`lib/metrics.js` (ROIC), `lib/valuation.js`, `lib/screener.js`, `lib/screener-companies.js` (motor + `selectFreeSample`), `lib/comparador.js`, `lib/currency.js` (FX), `lib/prices.js`, `lib/company-chart.js`, `lib/portfolio.js` (incl. `normalizeGbp`/`penceToPounds`), `lib/portfolio-calc.js`, `lib/dgi-score.js`, `lib/bank-metrics.js` (métricas y scoring de banca), `lib/supersectors.js` (3 supersectores + perfiles), `lib/taxonomy.js` (3 niveles sector/industria), `lib/build-plan.js`, `lib/index-constituents.js`, `lib/fund-fetch.js`, `lib/recurring.js`, `lib/admin.js`, `lib/admin-stats.js`, `lib/email.js`, `lib/dividend-safety.js` (seguridad 0–100), `lib/reit-metrics.js` (FFO/AFFO/payout), `lib/novedades.js`, `lib/analytics.js` (PostHog), `lib/analyst-estimates.js` (FMP).

## Componentes UI clave (sesión reciente)
`components/ThemeToggle.js` (tema claro/oscuro), `components/CompanyLogo.js` (logos auto-alojados + fallback monograma), `components/empresa/AnalystEstimates.js` (estimaciones FMP), `components/empresa/IncomeSankey.js` (Sankey del estado de resultados).
