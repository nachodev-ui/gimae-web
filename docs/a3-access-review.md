# A3 — Revisión de acceso a datos y Storage

_10 de octubre de 2026. Estado: completado. La migración `20261010175130_a3_authenticated_public_reads.sql` se probó en una base aislada y se aplicó al proyecto vinculado. No se cambiaron buckets, `pg_net` ni trabajos de conciliación._

## Modelo que se debe conservar

Auth identifica a la cuenta. Una fila en `public.profiles` autoriza todo Backstage mediante `private.is_admin()`; estar autenticada sin esa fila no concede administración. Las Edge Functions usan `service_role` para pedidos, pagos y canjes. Esta revisión distingue la lectura pública, la cuenta Auth sin perfil, la cuenta con perfil y `service_role`.

| Tablas o recursos | Visitante `anon` | Auth sin perfil | Auth con perfil | `service_role` |
| --- | --- | --- | --- | --- |
| `members`, `group_socials`, `events`, `products`, `product_variants`, `product_images` | Lee contenido público o activo. | Lee el mismo contenido público o activo. | Lee y administra todas las filas. | Acceso del servidor. |
| `posts`, `post_images` | Lee posts publicados, públicos y vigentes, y sus imágenes asociadas. | Lee el mismo contenido público. | Lee y administra todas las filas. | Acceso del servidor. |
| `gacha_cards`, `gacha_settings` | Lee cartas activas y configuración. | Lee las mismas cartas activas y configuración. | Lee y administra cartas y configuración según permisos de tabla. | Acceso del servidor. |
| `profiles` | No hay política de lectura o escritura. | Sin fila autorizante, no obtiene filas ni escritura administrativa. | Consulta y administra perfiles. | Acceso del servidor. |
| `merch_orders` | Sin acceso directo. | Sin acceso directo. | Lee y actualiza solo los campos permitidos para preparación de pedidos. | Crea y actualiza pedidos mediante las funciones del servidor. |
| `private.gacha_draws`, `private.gacha_redemptions`, `private.paypal_rate_limits`; `public.merch_reservation_lines`, `public.paypal_fx_rates`, `public.paypal_reconcile_auth`, `public.paypal_webhook_events`, `public.webpay_reconcile_auth` | Sin privilegios de tabla y sin políticas. | Igual. | Igual; se gestionan por servidor. | Acceso interno. |

Todas las tablas base inspeccionadas de `public` y `private` tienen RLS habilitado. La columna de privilegios SQL no demuestra acceso efectivo por sí sola: en las tablas públicas, RLS restringe las filas y operaciones. Las cinco tablas públicas y tres privadas sin políticas tampoco conceden privilegios directos a `anon` ni a `authenticated`.

| Bucket | Descarga pública | Lectura de objetos por política | Escritura |
| --- | --- | --- | --- |
| `gimae-products`, `gimae-members`, `gimae-gacha` | Sí, el bucket es público. | `gimae-gacha`: `anon` y Auth. Productos e integrantes: listado de objetos para cuentas con perfil. | Solo cuentas con perfil; integrantes se limitan a `members/%`. |
| `gimae-blog` | No, el bucket es privado. | `anon` y Auth sin perfil: solo objetos referenciados por un post público y vigente; cuenta con perfil: objetos válidos de posts. | Solo cuenta con perfil y ruta ligada a un post. |

Los buckets públicos exponen los archivos por URL pública aunque el listado de `storage.objects` sea más limitado. Por eso las imágenes de productos, integrantes y Gacha no deben contener datos privados. El bucket de blog sí depende de su política de lectura.

## Hallazgos y decisión por aviso

1. **Ocho tablas con RLS sin política (`INFO`).** Son las ocho tablas internas de la matriz. El catálogo confirma que `anon` y `authenticated` carecen de `SELECT`, `INSERT` y `UPDATE` en ellas. Mantenerlas cerradas es la intención vigente; crear políticas solo para acallar el asesor abriría acceso innecesario. [Aviso de Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
2. **`pg_net` en `public` (`WARN`).** La extensión instalada es `0.20.4` y no admite `ALTER EXTENSION ... SET SCHEMA`. Dos trabajos activos de `pg_cron` la usan para conciliación de PayPal y Webpay. La cola tenía cero solicitudes en la consulta puntual. La comprobación HTTP del proyecto vinculado dio `200` para `public` y `406/PGRST106` para `private` y `net`: `net` queda fuera de los esquemas expuestos de Data API. Exponerlo sería peligroso, especialmente por los encabezados de solicitudes en cola. Mover la extensión exige eliminarla y recrearla, lo que borra cola y respuestas y puede interrumpir ambas conciliaciones. **Decisión:** no reubicar `pg_net` en A3; por ello no se ensayó una recuperación de los trabajos. Una futura reubicación requiere ventana, respaldo de respuestas necesarias y ensayo de recuperación de PayPal y Webpay. [Documentación de `pg_net`](https://supabase.com/docs/guides/database/extensions/pg_net) y [aviso del asesor](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).
3. **Protección de contraseñas filtradas desactivada (`WARN`).** La organización está en el plan Free y Supabase documenta esa protección para Pro o superior. **Decisión:** registrar la limitación y revisar el plan con el propietario antes de prometer su activación. Mientras tanto, la regla de alta de cuentas con perfil sigue siendo la barrera de autorización del Backstage; no sustituye la protección de contraseñas. [Guía de contraseñas de Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Corrección de lectura pública

Las políticas `posts_public`, `post_images_read`, `gacha_cards_public` y `gacha_settings_public` se aplicaban únicamente a `anon`. `private.can_read_blog_image()` también exigía `auth.role() = 'anon'` para objetos de posts públicos. En la base aislada, la cuenta Auth sin perfil veía **0** posts públicos y **0** objetos públicos del blog antes de la migración, mientras `anon` veía **2** y **1** respectivamente. La prueba ampliada también falló con `outsider: lectura de posts incorrecta (0/0)` antes de la corrección. La migración permite esa lectura pública a `anon` y `authenticated` y conserva los predicados de publicación, visibilidad, vigencia y vínculo del objeto. Después, Auth sin perfil vio **2** posts y **1** objeto público en la prueba original, sin obtener escritura ni acceso a borradores.

`docs/admin-access-model.md` y `supabase/scripts/audit-access.sql` conservaban referencias a `public.is_admin()`, trasladada a `private` en `20261001165222_paypal_public_hardening.sql`. Se corrigieron esas referencias. No se alteró una migración aplicada.

## Verificación realizada

La prueba aislada se hizo en PostgreSQL 18 local, restaurando un volcado **solo de esquema** del proyecto vinculado, alineado con las migraciones locales antes de A3. Se sembraron cuatro buckets y una fila de configuración Gacha; `supabase/scripts/audit-access.sql` y `supabase/scripts/audit-access-a3.sql` corrieron con `ROLLBACK`. El segundo script comprobó cuatro identidades con filas públicas y privadas de prueba:

| Operación | `anon` | Auth sin perfil | Dos cuentas con perfil |
| --- | --- | --- | --- |
| Posts, imágenes y objetos de blog públicos; cartas activas, configuración y objetos Gacha | Permitida | Permitida tras migración | Permitida |
| Borradores, cartas inactivas y objetos de blog asociados; listado SQL de productos e integrantes | Denegada | Denegada | Permitida |
| `INSERT`, `UPDATE` y `DELETE` de objetos en los cuatro buckets | Denegadas | Denegadas | Permitidas con rutas válidas |
| `UPDATE` de posts, cartas y configuración Gacha | Denegada | Denegada | Permitida |
| `SELECT`, `INSERT`, `UPDATE` y `DELETE` de las ocho tablas internas | Denegadas | Denegadas | Denegadas |

En la prueba de `DELETE` de Storage se activó el ajuste local que emplea Storage API; el trigger bloquea el borrado SQL directo aun para cuentas con permiso. Ambos scripts terminaron correctamente tras aplicar la migración en la base aislada. No se creó una rama de Supabase, conforme a la indicación del propietario; el Docker local no pudo iniciarse por falta de virtualización WSL2.

Después de aplicar la migración al proyecto vinculado, `supabase migration list --linked` mostró `20261010175130` en ambos lados; las cuatro políticas tienen roles `{anon,authenticated}`. En una transacción remota de solo lectura, Auth sin perfil conservó `private.is_admin() = false` y vio **12** cartas activas y **1** fila de configuración Gacha (antes de la migración: **0/0**). No había posts públicos remotos para una comparación con datos reales; ese caso se verificó con fixtures aislados. `scripts/check-data-api-schemas.mjs` confirmó `public: 200`, `private: 406/PGRST106`, `net: 406/PGRST106`. El asesor de seguridad posterior conservó los mismos avisos: ocho tablas sin políticas, `pg_net` en `public` y protección de contraseñas filtradas desactivada; no surgieron nuevos avisos.
