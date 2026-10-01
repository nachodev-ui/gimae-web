# Backend Supabase de Gimae!

Proyecto: `hvaonobbpzbupanuymkh`. El sitio sigue siendo HTML/CSS/JS estático, publicado desde `dist/` bajo `/gimae-web/`. El carrito conserva el comportamiento actual; el inventario sin confirmar nunca indica disponibilidad.

## Aplicación reproducible

1. Aplicar los SQL de `migrations/` por orden. Las migraciones históricas `0001`–`0007` construyen el backend original; `0008` establece la fuente única de inventario, `0009` crea Storage para retratos y `0010` simplifica el acceso del Backstage a un único nivel administrativo. No reescribir migraciones ya registradas en producción.
2. Los buckets son `gimae-products` (lectura pública), `gimae-blog` (privado) y `gimae-members` (retratos de lectura pública). Una visitante `anon` solo obtiene del blog lo público y publicado; cualquier cuenta autorizada del Backstage puede gestionar todas las entradas y sus archivos. La página pública crea su propio cliente sin sesión persistente.
3. En un entorno privado con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, ejecutar `npm install` desde `supabase/`. Nunca guardar la secret/service_role key en `dist/` o Git.
4. La publishable key **pública** y la URL `https://hvaonobbpzbupanuymkh.supabase.co` están en `dist/supabase-config.js`. Si la API no responde, el sitio usa el respaldo local. Nunca colocar una secret/service_role key en `dist/`.
5. Consultar `scripts/summary.sql` para contar registros y verificar los precios. El seed contiene 4 integrantes, 3 enlaces del grupo, 5 productos, 13 variantes y 5 imágenes de producto.

## Regla de inventario de Merch

El stock tiene una sola fuente de verdad:

- Producto **sin variantes**: `products.stock` y `products.stock_confirmed` son el inventario real.
- Producto **con variantes**: `product_variants.stock` y `product_variants.stock_confirmed` son el inventario real. `products.stock` pasa a ser un resumen automático de las unidades confirmadas y `products.stock_confirmed` solo queda en `true` si todas las variantes fueron confirmadas.

La migración `0008` mantiene ese resumen con triggers y evita que una edición manual de `products.stock` cree una segunda fuente contradictoria. La tienda pública no utiliza el total del producto como fallback para una variante concreta. Véase [`../docs/merch-inventory-model.md`](../docs/merch-inventory-model.md).

## Acceso del equipo

Desde la migración `0010` no existen roles `admin`/`integrante` dentro de `public.profiles`. **La existencia de una fila en `profiles` es el permiso administrativo.** Una cuenta de Supabase Auth sin perfil no puede entrar al Backstage ni obtiene escritura por RLS.

Para invitar una cuenta autorizada desde un entorno privado:

```powershell
$env:SUPABASE_URL = "https://hvaonobbpzbupanuymkh.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<secret local>"
$env:TEAM_EMAIL = "correo@ejemplo.cl"
npm run user:enroll
```

Si la cuenta Auth ya existe, indicar además `TEAM_USER_ID=<uuid>` para vincularla sin reenviar invitación. El script crea o actualiza únicamente `{user_id,email}` en `profiles`; no hay `TEAM_ROLE` ni `MEMBER_ID`.

Todas las cuentas autorizadas tienen el mismo alcance: Blog, Merch, Integrantes, Eventos y los buckets administrables. Si en el futuro se añaden más cuentas para el equipo, cada una tendrá su propio login, pero todas podrán editar el contenido completo. Los registros de `members` son contenido público del sitio y no representan cuentas de acceso.

`posts.author_id` se conserva como trazabilidad de la cuenta que creó una entrada, pero **no limita su edición**. Cualquier cuenta con perfil puede leer, crear, editar o eliminar cualquier post. `author_name` existente se conserva; las nuevas entradas usan por defecto `Equipo Gimae`.

El campo `visibility` sigue distinguiendo contenido `publico` y `exclusivo`. El contenido exclusivo no se entrega a visitantes; en esta etapa solo se consulta desde el Backstage autorizado.

## Verificación de permisos

`scripts/audit-access.sql` ejecuta una auditoría reversible del modelo actual con cuatro contextos: visitante `anon`, usuario Auth sin perfil y dos cuentas administrativas. Comprueba que la visitante solo lea contenido público, que una cuenta sin perfil no pueda escribir, y que dos administradoras distintas puedan editar mutuamente sus posts y gestionar el resto del panel. La excepción `AUDIT_RESULT` final es intencional y revierte todos los fixtures.

[`../docs/audit-20260928.md`](../docs/audit-20260928.md) conserva la evidencia histórica de la auditoría anterior al modelo `0010`; sus referencias al rol `integrante` describen el estado antiguo y no la autorización vigente.
