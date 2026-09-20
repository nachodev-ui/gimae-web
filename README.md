# Gimae! — Idol Club

Sitio estático responsive para Gimae, grupo idol de Chile. Incluye Members con perfiles en modal, Eventos, Merch, Blog y redes sociales. Conserva el logo original suministrado por el grupo.

## Estructura

- `dist/index.html`: portada enfocada en el grupo, eventos, merch y redes.
- `dist/cheki.html`: estudio independiente para crear chekis digitales.
- `dist/gacha.html`: gacha independiente y álbum de photocards.
- `dist/styles.css`: diseño, responsive y movimiento reducido.
- `dist/content.js`: nombres, biografías, fotos y redes oficiales.
- `dist/app.js`: perfiles, catálogo de merch y enlaces de la portada.
- `dist/nav.js`: menú móvil y año compartidos entre las tres páginas.
- `dist/cheki.js`: generador de chekis en canvas, encuadre, descarga y compartir.
- `dist/gacha.js`: gacha gratuito, catálogo de cartas, rarezas y colección local.
- `dist/images/`: retratos limpios, logos con transparencia, presentación de merch y catálogo original.

No requiere instalación ni compilación. Publica el contenido de `dist` en cualquier hosting estático. Todos los recursos locales usan rutas relativas, por lo que funciona bajo `/gimae-web/` en GitHub Pages.

## Vista local

```sh
python3 -m http.server 8000 --directory dist
```

Abre `http://localhost:8000`.

## Contenido oficial

En `dist/content.js` están los nombres, colores y enlaces oficiales de Suki, Usi, Vewe y Vali, y las redes del grupo (Instagram, TikTok y Spotify). También están los cinco tipos de merch y sus precios en pesos chilenos, transcritos del catálogo suministrado.

Los retratos se limpiaron con edición de imágenes para eliminar las superposiciones de Instagram y otras personas. La presentación de merch es una reconstrucción ilustrativa basada en el catálogo; el modal permite consultar también la imagen original para comparar los diseños. Los logos se usan con transparencia real.

Los eventos y el blog continúan mostrando estados de próxima publicación. Las consultas sobre stock, tallas y pedidos enlazan al Instagram oficial. No se afirman disponibilidad ni opciones de entrega no confirmadas.

Esta versión no incluye pagos, carrito, CMS, cuentas ni formularios. Google Fonts es opcional: la página usa fuentes de sistema si no está disponible.

## Generador de chekis

La página `dist/cheki.html` procesa la selfie únicamente en el navegador. Los nombres y colores se leen desde `dist/content.js`; para cambiar un tono, edita el campo `accent` de la integrante. El límite de archivo y las medidas del canvas están comentados al inicio de `dist/cheki.js`. No se envían ni guardan fotografías en ningún servidor.

## Gacha de photocards

La página `dist/gacha.html` contiene un catálogo editable de 12 cartas que reutilizan los cuatro retratos oficiales sin alterar los rostros. Probabilidades, límite diario opcional y nuevas cartas se configuran al inicio de `dist/gacha.js`. El álbum y los duplicados se guardan en `localStorage` cuando el navegador lo permite. Es un juego gratuito sin pagos, premios físicos ni relación con el stock de merch.

## Accesibilidad

Navegación por teclado, enlace para saltar al contenido, modal nativo con cierre mediante Escape y retorno del foco, control del menú móvil y soporte de `prefers-reduced-motion`.

## Publicación

El sitio está preparado para hosting estático. `.openai/hosting.json` identifica la vista publicada en Sites. Para GitHub Pages puede usarse un workflow que publique `dist`; no es necesario cambiar las rutas.
