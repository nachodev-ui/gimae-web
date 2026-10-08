# Gimae! — Idol Club

Sitio de Gimae!, grupo idol chileno, con portada, perfiles de Suki, Usi, Vewe y Vali, eventos, blog, tienda de merch, estudio de chekis, gacha de photocards y un avatar animado de Suki. El frontend es HTML, CSS y JavaScript estáticos; Supabase aporta contenido, autenticación del Backstage, almacenamiento, inventario y funciones de pago. El sitio se publica desde `dist/` en GitHub Pages bajo `/gimae-web/`.

**Estado de compra:** la tienda tiene carrito y checkout, pero el flujo público normal todavía no ofrece un pago listo. En `dist/content.js` PayPal y Webpay están desactivados; la transferencia figura activada, aunque sus datos `COMPLETAR` impiden seleccionarla. Existen vistas de prueba explícitas para PayPal Sandbox y Webpay Plus de integración en localhost y GitHub Pages. No equivalen a pagos Live.

## Estructura

| Ruta | Función |
| --- | --- |
| `dist/index.html`, `app.js`, `public-events*.js`, `blog-richtext.js` | Portada, integrantes en diálogos, eventos, blog y vitrina de merch. |
| `dist/shop.html`, `shop.js`, `shop-*.js` | Catálogo, galería, disponibilidad por variante, carrito, entrega, checkout y consulta del estado del pedido. |
| `dist/cheki.html`, `cheki.js` | Cheki digital: la foto se procesa en el navegador y se puede descargar o compartir. |
| `dist/gacha.html`, `gacha.js` | Gacha gratuito y álbum guardado localmente; no consume inventario de merch. |
| `dist/404.html` | Página de error del sitio. |
| `dist/content.js`, `backend.js`, `supabase-config.js` | Contenido de respaldo y configuración pública; lectura de Supabase con límite de espera de 8 segundos. |
| `dist/avatar.js`, `effects.js`, `nav.js` | Diálogos y sprites locales de Suki, efectos, música sintetizada y navegación compartida. |
| `dist/admin/` | Backstage: Blog Studio, Merch Studio y su mesa de inventario/pedidos, integrantes, eventos, intentos PayPal y alertas Webpay. |
| `dist/styles.css`, otras hojas `*.css`, `dist/images/` | Diseño responsive, estilos de módulos e imágenes del sitio, catálogo y avatar. |
| `supabase/migrations/`, `functions/`, `scripts/`, `tests/` | Esquema y RLS, Edge Functions, tareas de operación y pruebas SQL. |
| `docs/`, `tests/`, `scripts/check-secrets.mjs` | Guías del modelo y pagos, regresión del avatar y guardia de secretos. |
| `.github/workflows/`, `.openai/hosting.json` | Validación de PR, despliegue de Pages y configuración de una vista estática en Sites. |

`dist/` es el código fuente publicado: no hay build ni instalación de dependencias para servir el sitio. `supabase/package.json` contiene utilidades administrativas del backend, no un build del frontend. Los recursos locales usan rutas relativas para funcionar bajo el subdirectorio de Pages.

## Vista local

Desde la raíz del repositorio en Windows:

```powershell
py -m http.server 8000 --directory dist
```

Abre `http://localhost:8000/`, `/shop.html` o `/admin/`. Las páginas públicas se pueden recorrer sin iniciar sesión. Backstage requiere una cuenta de Supabase Auth autorizada mediante una fila en `public.profiles`. Una cuenta Auth sin esa fila no obtiene acceso administrativo.

`dist/content.js` contiene miembros, redes, merch de respaldo, efectos, `SHIPPING`, `PAYMENT_METHODS`, `BANK_TRANSFER`, `ORDER_CONTACTS` y los diálogos `AVATAR_SCRIPT`. Conserva las marcas `COMPLETAR` hasta disponer de información oficial. `dist/supabase-config.js` contiene solo la URL y la clave publicable del cliente; nunca se coloca allí una secret key o `service_role`. `dist/backend.js` intenta leer integrantes, redes, productos, variantes, imágenes, posts y eventos desde Supabase. Si falla o supera 8 segundos, se conserva el contenido local. Ese respaldo permite navegar, pero no autoriza a cobrar con precios o stock sin verificar.

## Tienda, inventario y pedidos

El carrito conserva identificadores, variantes y cantidades en `localStorage` y vuelve a obtener los precios del catálogo al cargar. La tienda muestra disponibilidad confirmada por producto o variante. En un producto sin variantes, `products.stock` es la fuente de inventario; si tiene variantes, lo son `product_variants.stock` y `stock_confirmed` de cada variante. El total en `products` pasa a ser un resumen calculado, nunca disponibilidad para una variante concreta. Véase [el modelo de inventario](docs/merch-inventory-model.md).

`SHIPPING` ofrece retiro a coordinar y Starken a domicilio **por pagar**. En Starken se solicitan datos de destinatario; el transporte se paga directamente a Starken al recibir y no se suma al cobro de los productos. La mesa de pedidos del Backstage separa retiro y despacho y exige número de flete para registrar la entrega a Starken. La guía de prueba está en [STARKEN_SANDBOX.md](supabase/STARKEN_SANDBOX.md).

Las órdenes de **prueba** (`order_environment=test`) y **reales** (`live`) tienen recorridos distintos. Webpay de integración siempre crea pedidos de prueba; PayPal depende de `PAYPAL_ENV` en el servidor. Las pruebas registran el resultado, pero no reservan ni descuentan stock físico ni entran en la bandeja real. Backstage ofrece una práctica Sandbox con estados y notas `test_*` separados. Las órdenes Live reservan unidades transaccionalmente durante el intento y descuentan stock una sola vez al confirmar el pago; pagos tardíos o faltantes requieren revisión. Véase [stock y pedidos](docs/merch-stock-orders.md).

## Pagos de prueba y configuración

- **PayPal Sandbox:** abre `http://localhost:8000/shop.html?paypal-sandbox=1`. Las funciones crean, capturan y consultan órdenes; webhook y conciliación verifican el resultado. El servidor calcula el total CLP desde la base y obtiene el tipo de cambio para mostrar el importe USD antes de pagar. Consulta [la guía PayPal](docs/paypal-sandbox.md).
- **Webpay Plus integración:** abre `http://localhost:8000/shop.html?webpay-sandbox=1`. El módulo de servidor está fijado al host de integración de Transbank y opera en CLP. El retorno del navegador inicia el `commit`; la conciliación consulta estado y deja resultados inciertos en revisión, sin asumir un pago. Consulta [la guía Webpay](supabase/WEBPAY_SANDBOX.md).
- **Transferencia:** el selector solo queda listo cuando todos los campos de `BANK_TRANSFER` estén completos; en el estado actual, las instrucciones y el pedido se guardan localmente. No hay confirmación automática de transferencia.

Las mismas rutas de prueba existen bajo `https://nachodev-ui.github.io/gimae-web/` con sus parámetros de consulta. Requieren que Supabase responda y que el servidor tenga configurado el entorno correspondiente. Las guías históricas de pago pueden describir un checkout anterior; para entrega y aislamiento rigen las migraciones y el código actuales.

Los nombres que usa el backend se configuran como **Supabase Edge Function Secrets**, fuera de Git: `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ALLOWED_ORIGINS` y `BCCH_API_TOKEN` para PayPal; `WEBPAY_INTEGRATION_COMMERCE_CODE` y `WEBPAY_INTEGRATION_API_KEY` para Webpay. Las funciones usan además `SUPABASE_URL` y `SUPABASE_SECRET_KEYS` o `SUPABASE_SERVICE_ROLE_KEY` proporcionadas por la plataforma. Los tokens de conciliación se gestionan en Vault y sus scripts de programación están en `supabase/scripts/`. Para las utilidades privadas de `supabase/` se usan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y, según el script, `TEAM_EMAIL`/`TEAM_USER_ID`. No se escriben valores en documentación, PRs ni frontend.

## Backstage y acceso

`dist/admin/` reúne Blog Studio (edición y medios), Merch Studio/Desk (catálogo, variantes, imágenes e inventario), integrantes, eventos, pagos y preparación. `public.profiles` es la lista de cuentas administrativas: todas las cuentas con perfil comparten acceso a los módulos; `public.members` son datos del grupo, no cuentas. RLS limita la lectura anónima al contenido público y publicado y la escritura a las cuentas autorizadas. Storage usa `gimae-products` y `gimae-members` de lectura pública, y `gimae-blog` privado con acceso a los objetos de posts públicos que permite su política. Véanse [el acceso actual](docs/admin-access-model.md) y [la guía del backend](supabase/README.md). `docs/audit-20260928.md` describe un modelo de roles anterior y es histórico.

## Verificación y publicación

El workflow [validate-static.yml](.github/workflows/validate-static.yml) se ejecuta en PRs hacia `main`: revisa secretos evidentes, sintaxis de los JavaScript de `dist/` y referencias locales de scripts y hojas de estilo en los HTML. Para cambios relevantes también existen `tests/avatar-pastel-regression.mjs`, pruebas de conciliación en `supabase/functions/_shared/*.test.mjs` y pruebas SQL reversibles en `supabase/tests/` y `supabase/scripts/`. Antes de un PR, revisa `git diff --check` y ejecuta las pruebas que correspondan.

Un push a `main` dispara [deploy-pages.yml](.github/workflows/deploy-pages.yml): sube `dist/` como artefacto y lo publica en GitHub Pages sin compilación. Por eso un merge a `main` es un despliegue. `.openai/hosting.json` también señala `dist/` como directorio estático para Sites; no gobierna el workflow de Pages.

## Antes de pagos Live

El repositorio implementa rutas Live para PayPal, pero no confirma por sí solo que estén listas ni activas en un servicio remoto. Antes de ofrecerlas al público hacen falta, como mínimo, credenciales y webhook Live separados, revisión de secretos y orígenes, operación de conciliación y reservas, pruebas completas de compra, estados inciertos, reembolsos y atención, inventario físico confirmado, textos legales y aceptación operativa. La [guía PayPal](docs/paypal-sandbox.md) registra además pendientes de `pg_net` y protección de contraseñas filtradas. Webpay permanece fijado al ambiente de integración: Live requiere una implementación y credenciales distintas, contrato/certificación de Transbank y aceptación específica. No basta con cambiar un `enabled` en `content.js`.
