# Gimae! — Idol Club

Sitio estático responsive para Gimae, grupo idol de Chile. Incluye Members con perfiles en modal, Eventos, Merch, Blog y redes sociales. Conserva el logo original suministrado por el grupo.

## Estructura

- `dist/index.html`: portada enfocada en el grupo, eventos, merch y redes.
- `dist/shop.html`: tienda, carrito, checkout y textos informativos.
- `dist/cheki.html`: estudio independiente para crear chekis digitales.
- `dist/gacha.html`: gacha independiente y álbum de photocards.
- `dist/styles.css`: diseño, responsive y movimiento reducido.
- `dist/content.js`: nombres, biografías, fotos y redes oficiales.
- `dist/app.js`: perfiles, catálogo de merch y enlaces de la portada.
- `dist/nav.js`: menú móvil y año compartidos entre las cuatro páginas.
- `dist/shop.js`: carrito local, transferencia, PayPal opcional y resumen de pedido.
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

La tienda incluye carrito local y checkout configurable. El panel en `dist/admin/` usa Supabase Auth y RLS para editar blog, productos, integrantes y eventos. No hay cuentas públicas, reservas de inventario ni confirmación de pagos en el backend. Google Fonts es opcional: la página usa fuentes de sistema si no está disponible.

## Generador de chekis

La página `dist/cheki.html` procesa la selfie únicamente en el navegador. Los nombres y colores se leen desde `dist/content.js`; para cambiar un tono, edita el campo `accent` de la integrante. El límite de archivo y las medidas del canvas están comentados al inicio de `dist/cheki.js`. No se envían ni guardan fotografías en ningún servidor.

## Gacha de photocards

La página `dist/gacha.html` contiene un catálogo editable de 12 cartas que reutilizan los cuatro retratos oficiales sin alterar los rostros. Probabilidades, límite diario opcional y nuevas cartas se configuran al inicio de `dist/gacha.js`. El álbum y los duplicados se guardan en `localStorage` cuando el navegador lo permite. Es un juego gratuito sin pagos, premios físicos ni relación con el stock de merch.

## Tienda y pagos

El catálogo publicado se lee de Supabase; `dist/content.js` funciona como respaldo visual si falla la API. PayPal solo permite cobrar cuando el catálogo en Supabase responde y tiene stock confirmado. La configuración de envío y pago sigue en `dist/content.js`: `SHIPPING`, `PAYMENT_METHODS`, `BANK_TRANSFER`, `ORDER_CONTACTS`. Los valores `COMPLETAR`, el stock sin confirmar y PayPal desactivado son intencionales: no deben reemplazarse por datos inventados.

El carrito guarda solo IDs, variantes y cantidades. Al cargar, `dist/shop.js` descarta referencias antiguas y recupera precios desde el catálogo. Los pedidos por transferencia siguen siendo locales; los pedidos PayPal se guardan en Supabase. No existe reserva automática de stock.

La integración PayPal segura usa Supabase Edge Functions para calcular precios, crear y capturar órdenes en USD, y verificar el webhook antes de marcar `paid`. Se activa solo tras configurar secretos y probar Sandbox. Véase [`docs/paypal-sandbox.md`](docs/paypal-sandbox.md).

Una CSP es recomendable, pero debe probarse con Google Fonts y los dominios vigentes del SDK de PayPal antes de activarla. En GitHub Pages puede declararse mediante una etiqueta `meta`, aunque las cabeceras HTTP ofrecen mayor control cuando el hosting las permite.

## Accesibilidad

Navegación por teclado, enlace para saltar al contenido, modales nativos con cierre mediante Escape y retorno del foco, control del menú móvil y soporte de `prefers-reduced-motion`.

## Publicación

El sitio está preparado para hosting estático. `.openai/hosting.json` identifica la vista publicada en Sites. Para GitHub Pages puede usarse un workflow que publique `dist`; no es necesario cambiar las rutas.

## Panel y datos

Las migraciones, el acceso del equipo y la auditoría de permisos se documentan en [`supabase/README.md`](supabase/README.md). La URL y publishable key públicas se configuran en `dist/supabase-config.js`; la página conserva datos locales cuando la API no responde. El flujo de GitHub Pages despliega `dist/` solo al actualizar `main`; esta rama no está publicada allí.
