# Modelo de acceso del Backstage

Vigente desde `202609290010_admin_only_access.sql`.

## Regla principal

Gimae no utiliza roles internos por integrante. Supabase Auth demuestra la identidad; `public.profiles` funciona como lista de autorización del Backstage:

- existe `profiles.user_id = auth.uid()` → cuenta administrativa;
- no existe fila → no tiene acceso de administración.

`profiles` contiene únicamente `user_id`, `email` y timestamps. Las columnas históricas `role` y `member_id` se eliminan en `0010`.

## Integrantes vs. cuentas

`public.members` representa contenido del sitio: Suki, Usi, Vewe, Vali, colores, biografías, retratos y redes. No representa usuarios de Auth.

Una integrante solo necesitaría una cuenta Auth si alguna vez necesita entrar personalmente al Backstage. Si se crea, se agrega una fila en `profiles` y tendrá el mismo alcance administrativo que las demás cuentas autorizadas.

## Blog

`posts.author_id` se mantiene para saber qué cuenta creó una entrada, pero no participa en RLS. Cualquier cuenta autorizada puede leer, crear, editar y borrar cualquier post y cualquier recurso de su galería.

Las visitas anónimas y las cuentas Auth sin perfil pueden leer posts `publicado + publico + published_at <= now()`. El bucket `gimae-blog` sigue siendo privado; su política permite a ambas leer únicamente los objetos vinculados a posts públicos y a cuentas administrativas todos los objetos válidos. Esta paridad de lectura pública se estableció en `20261010175130_a3_authenticated_public_reads.sql`.

`author_name` de posts existentes se conserva. Las nuevas entradas usan el default `Equipo Gimae`; ya no se deriva el nombre desde una relación cuenta↔integrante.

## Otros módulos

`members`, `products`, `product_variants`, `product_images`, `events`, `gimae-products` y `gimae-members` continúan utilizando `private.is_admin()`. Desde `0010`, esa función comprueba únicamente la existencia de la cuenta en `profiles`, por lo que todas las áreas del Backstage comparten una sola regla. La migración `20261001165222_paypal_public_hardening.sql` la trasladó de `public` a `private` para que no se publique como RPC.

## Seguridad

Una cuenta Auth creada por registro, invitación incompleta o cualquier otro mecanismo no obtiene permisos administrativos por estar autenticada. Debe existir explícitamente en `profiles`.

El alta normal se hace fuera del navegador con `supabase/scripts/enroll-user.mjs` y una service/secret key local. Nunca se expone esa clave en `dist/`.

## Auditoría

`supabase/scripts/audit-access.sql` prueba de forma reversible:

1. visitante anónima: solo contenido público;
2. usuario Auth sin perfil: sin escritura administrativa;
3. Admin A: puede editar contenido creado por Admin B;
4. Admin B: puede editar contenido creado por Admin A.

El documento `audit-20260928.md` describe el modelo anterior y se conserva únicamente como registro histórico de aquella revisión.
