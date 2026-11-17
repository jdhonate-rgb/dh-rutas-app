# DH Rutas (app del celular)
Código de la app. NO subas aquí datos de clientes ni llaves secretas.
Solo la URL del proyecto y la llave *publishable* van en `js/config.js`.

## Estructura
- `index.html`, `manifest.webmanifest`, `sw.js` — van en la raíz (el service worker necesita estar en la raíz).
- `js/` — código de la app (`app.js`, `ruta.js`, `gastos.js`, `gestion.js`, `finanzas.js`, `admin.js`, `reportes.js`, `movs.js`, `lib.js`, `state.js`, `xlsx.js`, `config.js`).
- `css/app.css` — estilos.
- `vendor/supabase.js` — librería de Supabase.
- `icons/` — íconos de la app.

Al cambiar archivos de la app, sube también `sw.js` con el número de `VERSION` más alto para que los teléfonos se actualicen.
