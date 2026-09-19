# Gimae! — Idol Club

Sitio estático responsive para Gimae, grupo idol de Chile. Incluye Members con perfiles en modal, Eventos, Merch, Blog y redes sociales. Conserva el logo original suministrado por el grupo.

## Estructura

- `dist/index.html`: secciones y contenido editorial.
- `dist/styles.css`: diseño, responsive y movimiento reducido.
- `dist/content.js`: nombres, biografías, fotos y redes oficiales.
- `dist/app.js`: perfiles, menú móvil y enlaces.
- `dist/logo.webp`: versión optimizada del logo proporcionado.

No requiere instalación ni compilación. Publica el contenido de `dist` en cualquier hosting estático. Todos los recursos locales usan rutas relativas, por lo que funciona bajo `/gimae-web/` en GitHub Pages.

## Vista local

```sh
python3 -m http.server 8000 --directory dist
```

Abre `http://localhost:8000`.

## Contenido oficial

En `dist/content.js`, reemplaza `null` por el nombre, biografía, foto y enlaces HTTPS de cada integrante. Agrega los enlaces del grupo en `socials`. Las redes sin URL aparecen como «Pronto» y no llevan a perfiles inventados. Los colores de las tarjetas son propuestas visuales, no colores oficiales de las integrantes.

Los eventos, la tienda y el blog muestran estados de próxima publicación. No existen fechas, entradas, productos, precios ni artículos ficticios. Para incorporar los primeros anuncios, edita sus secciones en `dist/index.html`.

Esta versión no incluye pagos, carrito, CMS, cuentas ni formularios. Google Fonts es opcional: la página usa fuentes de sistema si no está disponible.

## Accesibilidad

Navegación por teclado, enlace para saltar al contenido, modal nativo con cierre mediante Escape y retorno del foco, control del menú móvil y soporte de `prefers-reduced-motion`.

## Publicación

El sitio está preparado para hosting estático. `.openai/hosting.json` identifica la vista publicada en Sites. Para GitHub Pages puede usarse un workflow que publique `dist`; no es necesario cambiar las rutas.
