# Mi Índice DGI

## Estructura del proyecto

```
mi-indice-dgi/
  index.html          ← Abre esto en el navegador
  data/
    dict.js           ← Diccionario de 1279 empresas (no editar)
  js/
    helpers.js        ← Funciones de cálculo (DCF, CAGR, yield, etc.)
    analysis.js       ← Salud financiera, foso económico, insights
    components.js     ← CompanyRow, CompanyDetail, SettingsPage, etc.
    app.js            ← App principal (estados, filtros, render)
```

## Cómo usar

1. Abre `index.html` directamente en Chrome/Edge
2. Para editar con Claude Code: abre terminal en esta carpeta y escribe `claude`

## IMPORTANTE: Abrir localmente

Por seguridad, los navegadores modernos bloquean la carga de ficheros JS locales.
Necesitas un servidor local mínimo. Con Node instalado:

  npx serve .

Luego abre http://localhost:3000 en el navegador.

O instala la extensión "Live Server" en VS Code y pulsa "Go Live".
