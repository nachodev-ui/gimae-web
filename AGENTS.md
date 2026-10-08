# AGENTS.md — gimae-web

Guía para agentes que trabajan en este repositorio. Responde y redacta PRs en español; el sitio usa CLP y el entorno de trabajo del propietario es Windows. Contrasta siempre esta guía con `git ls-files`, el código y las migraciones vigentes antes de cambiar algo. `docs/audit-20260928.md` describe roles antiguos; el modelo actual está en `docs/admin-access-model.md`.

## Mapa y reglas del sitio

- **`dist/` es el código fuente real.** GitHub Pages publica esa carpeta tal cual; no hay build, bundler ni `npm install` del frontend. Vista local: `py -m http.server 8000 --directory dist` y `http://localhost:8000/`.
- Páginas: `dist/index.html` (portada, miembros, eventos, blog y merch), `shop.html` (tienda), `cheki.html` (canvas local), `gacha.html` (juego local), `404.html` y `admin/index.html` (Backstage).
- `dist/content.js` aporta datos y respaldo; `supabase-config.js` contiene solo URL y clave publicable; `backend.js` consulta Supabase con límite de 8 s y conserva el respaldo si falla. `app.js` pinta la portada; `shop.js` gestiona carrito, entrega y pagos; `avatar.js` usa sprites y diálogos locales sin IA ni backend. `dist/images/` incluye retratos, logos, merch y sprites. `dist/admin/` separa módulos de Blog, Merch, inventario, pedidos, integrantes y eventos.
- Conserva rutas relativas bajo `/gimae-web/`. Revisa las referencias de cada HTML al tocar JS o CSS. Las versiones `?v=` de `styles.css`, `content.js` y `avatar.js` varían hoy según la página: incrementa las referencias **que cargan el recurso modificado**, sin asumir una versión global. Mantén `content.js` antes de `backend.js`, `app.js`/`shop.js` y `avatar.js`; respeta el orden y los tipos de script existentes.
- No inventes datos oficiales, stock, tallas, precios, entrega ni textos del avatar: conserva `COMPLETAR` hasta recibir datos confirmados. Mantén el respaldo local, la seguridad del render de blog, navegación por teclado, foco, modales y `prefers-reduced-motion`. No reconstruyas imágenes o estampados oficiales.

## Pagos, datos y seguridad

- Estado actual de `dist/content.js`: `PAYMENT_METHODS.paypal.enabled=false` y `webpay.enabled=false`. La transferencia figura `enabled=true`, pero `BANK_TRANSFER` sigue con `COMPLETAR` y `shop.js` la deshabilita. Las URLs `?paypal-sandbox=1` y `?webpay-sandbox=1` muestran pruebas en localhost y Pages; no son Live. Webpay está fijado al host de integración. `PAYPAL_ENV` del servidor determina `test` o `live` para PayPal; no infieras ese entorno de un parámetro del navegador.
- `supabase/migrations/` es la historia SQL; no edites una migración aplicada. Los nombres existentes comienzan con versiones `202609280001`…`202609290010` y luego timestamps de 14 dígitos. Comprueba `supabase migration list` y usa `supabase migration new <nombre>` para nuevas migraciones cuando corresponda.
- Modelo vigente desde `202609290010_admin_only_access.sql`: Auth identifica a la cuenta; una fila en `public.profiles` autoriza **todo** Backstage. No hay roles de integrante/admin por tabla. `public.members` es contenido. RLS deja lectura anónima de contenido público, restringe escritura al perfil autorizado y protege pedidos. Buckets: `gimae-products` y `gimae-members` públicos; `gimae-blog` privado, con lectura selectiva de objetos vinculados a posts públicos. Antes de tocar permisos, lee `docs/admin-access-model.md`, migraciones y `supabase/scripts/audit-access.sql`.
- Inventario: sin variantes, `products.stock`; con variantes, `product_variants.stock` es la fuente y `products.stock` es un resumen automático. Lee `docs/merch-inventory-model.md` y `docs/merch-stock-orders.md` antes de tocar reservas. `order_environment=test` (Webpay integración; PayPal Sandbox) no reserva ni descuenta stock y usa preparación `test_*` aparte; `live` conserva reserva y descuento transaccionales. No repongas stock basándote solo en asignaciones históricas: coteja inventario físico.
- Starken `starken_por_pagar` cobra el flete al destinatario fuera del total de productos; el snapshot de entrega y el número de flete se validan en navegador y servidor. Consulta `supabase/STARKEN_SANDBOX.md`.
- Nunca agregues secretos a Git, `dist/`, logs, PRs o chat. Conserva la clave `service_role` solo en un entorno privado. Las credenciales de PayPal y `WEBPAY_INTEGRATION_*` se configuran en Supabase Edge Function Secrets; la conciliación usa Vault. Si falta una variable, indica **su nombre y dónde configurarla**, sin pedir el valor. Ejecuta `node scripts/check-secrets.mjs` antes de proponer cambios sensibles. Clasifica alertas de GitGuardian antes de actuar; no reescribas historial ni rotes claves por reflejo.

## Verificación real del repositorio

Desde la raíz, según el cambio:

```powershell
git ls-files
Get-ChildItem dist -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
node --experimental-strip-types --test supabase/functions/_shared/paypal-reconcile.test.mjs
node --experimental-strip-types --test supabase/functions/_shared/webpay-reconcile.test.mjs
node tests/avatar-pastel-regression.mjs
node scripts/check-secrets.mjs
git diff --check
```

La validación de referencias locales de `<script src>` y `<link rel="stylesheet">` está en `.github/workflows/validate-static.yml` (paso «Validar scripts y estilos enlazados»); en Windows ejecútala con `py` si la reproduces localmente. CI también revisa secretos y `node --check` en todos los JS de `dist/`. Las pruebas SQL existentes están en `supabase/tests/` y `supabase/scripts/test-*.sql`; ejecútalas solo en el entorno correcto, con transacción/`ROLLBACK` y revisión previa. La inspección visual de escritorio y móvil sigue siendo necesaria para cambios de UI.

## Git y permisos del propietario

- Parte de `main` remoto actual; ramas observadas: `feature/<tema>`, `fix/<tema>`, `integration/<tema>`. Un tema por PR. El historial usa PRs descriptivos y merge commits; explica `Alcance`, `Verificación` y `Pendiente` en español. `.github/workflows/deploy-pages.yml` publica `dist/` en cada push a `main`: **merge = despliegue**.
- El propietario autoriza crear ramas remotas (locales si el entorno lo permite), abrir PRs y hacer merge a `main` cuando CI pase y GitGuardian no reporte secretos nuevos, salvo que la tarea pida revisión previa. También autoriza aplicar migraciones y desplegar Edge Functions en el proyecto vinculado siguiendo las reglas del repo y la verificación correspondiente. En una tarea limitada a documentación, no hagas esas operaciones.
- **Pide confirmación explícita antes de** force-push o reescribir historial; operaciones destructivas en base o Storage; habilitar PayPal o Webpay al público; tocar configuración o credenciales Live; rotar secretos. Para datos de producción, revisa SQL, destino y efecto antes de ejecutar.
- Mantén cada cambio enfocado; revisa `git diff` y no modifiques archivos fuera del alcance. Si un archivo o comando citado aquí no existe, verifica el árbol y actualiza la guía en vez de improvisar.
