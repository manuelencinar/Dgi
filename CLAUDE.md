# Mi Índice DGI — Contexto del proyecto

## Qué es esta app
Plataforma web freemium de análisis DGI (Dividend Growth Investing).
Cubre 43 mercados globales, casi 2000 empresas de más de 30 países.
URL del repositorio: https://github.com/manuelencinar/Dgi

## Stack técnico
- Frontend: Next.js con TypeScript
- Base de datos y auth: Supabase
- Pagos: Stripe (configurado con plan mensual y anual)
- Hosting: Vercel
- Emails: Resend (pendiente de configurar)
- Datos financieros: yfinance via script Python en GitHub Actions (pendiente de crear)

## Estructura de carpetas
```
/
├── webapp/        ← app Next.js principal
├── project/       ← ficheros del proyecto HTML original
├── scripts/       ← scripts Python para actualización de datos
└── .git/          ← repositorio git
```

## Páginas construidas y funcionando
- Landing page pública — presenta la app y los planes de precio
- Página de mercados — lista de 43 mercados globales con tarjetas resumen
- Página de cada mercado individual — empresas del índice con análisis DGI
- Screener avanzado — filtros DGI transversales entre los 43 mercados
- Página de detalle de cada empresa — gauge salud financiera, DCF, historial dividendos, estados financieros
- Módulo de cartera completo (app/cartera/) — ver sección "Módulo de cartera"

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
- `user_settings` — configuración del usuario, incluye stripe_customer_id y stripe_subscription_id
- `company_fundamentals` — datos financieros de todas las empresas, actualización semanal

## Tabla company_fundamentals — campos principales
precio, dps, div_streak, div_cagr5, div_history, payout_fcf, payout_eps,
fcf_per_share, fcf_cagr5, debt_ebitda, net_debt, net_debt_ebitda,
interest_coverage, roic, roe, roa, operating_margin, net_margin, gross_margin,
current_ratio, revenue_cagr5, pe_trailing, pe_forward, ev_ebitda, beta,
week52_high, week52_low, market_cap_m, sector, industry, country,
income_statement_annual, balance_sheet_annual, cashflow_annual,
income_statement_quarterly, balance_sheet_quarterly, cashflow_quarterly,
updated_at

## Script Python — pendiente de crear
Fichero: scripts/update_fundamentals.py
- Descarga datos de yfinance de casi 2000 empresas
- Calcula métricas derivadas: ROIC, div_streak, div_cagr5, payout_fcf, net_debt_ebitda, etc.
- Descarga estados financieros completos 4 años anuales y trimestrales
- Traduce partidas contables al español
- Escribe en Supabase via service role key con upsert
- Procesa en lotes de 50 con 2 segundos entre tickers para evitar rate limiting
- Gestiona NaN e Infinity convirtiéndolos a None antes de escribir

## GitHub Actions — pendiente de crear
Fichero: .github/workflows/update_fundamentals.yml
- Se ejecuta automáticamente cada domingo a las 6:00 UTC
- También ejecutable manualmente desde GitHub
- Secrets necesarios: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
