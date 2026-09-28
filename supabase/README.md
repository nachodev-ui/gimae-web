# Backend Supabase de Gimae!

Proyecto: `hvaonobbpzbupanuymkh`. El sitio sigue siendo HTML/CSS/JS estático, publicado desde `dist/` bajo `/gimae-web/`. El carrito y las consultas por Instagram conservan el comportamiento actual; el inventario sin confirmar nunca indica disponibilidad.

## Aplicación reproducible

1. Aplicar los SQL de `migrations/` por orden (`0001` esquema/RLS, `0002` autora, `0003` seed, `0004` Storage, `0005` URLs de Storage). No aplicar a otro proyecto. El seed procede de `dist/content.js`; `node scripts/build-seed.mjs` lo regenera, sin inventar stock ni contenido.
2. Los buckets son `gimae-products` (lectura pública) y `gimae-blog` (privado). El catálogo local se conserva como respaldo. **Estado de auditoría:** `0006_private_editorial_reads.sql` está preparado en esta rama, pero todavía no se ha aplicado a la base de producción. Hasta aplicarlo, una integrante autenticada puede leer posts públicos y las imágenes asociadas de otras autoras mediante la API. La corrección restringe las lecturas autenticadas a la autora y a la admin; una visitante `anon` conserva acceso solo a lo público y publicado. La página pública crea su propio cliente sin sesión persistente.
3. En un entorno privado con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, ejecutar `npm install` y `npm run images:upload` desde `supabase/`. El script sube `dist/images` y actualiza las URL en la base. Es reejecutable y no sobrescribe ediciones posteriores de URLs. Nunca guardar la secret/service_role key en `dist/` o Git.
4. La publishable key **pública** y la URL `https://hvaonobbpzbupanuymkh.supabase.co` están en `dist/supabase-config.js`. Si la API no responde, el sitio usa el respaldo local. Nunca colocar una secret/service_role key en `dist/`.
5. Consultar `scripts/summary.sql` para contar registros y verificar los precios. El seed contiene 4 integrantes, 3 enlaces del grupo, 5 productos, 13 variantes y 5 imágenes de producto. Eventos, posts y perfiles parten vacíos; el stock en cero está marcado sin confirmar. Las postales no tienen imagen en el catálogo.

## Equipo

La primera cuenta para `nacho.rtk@gmail.com` se invita desde un entorno privado con `TEAM_EMAIL=nacho.rtk@gmail.com TEAM_ROLE=admin npm run user:enroll`; el script usa la Admin API de Supabase Auth y agrega el perfil solo después de crear la invitación. Se establece la contraseña mediante el enlace de Auth. Si la cuenta ya existe, indicar `TEAM_USER_ID=<uuid>` para asignar el perfil sin reenviar invitación. Para integrantes usar `TEAM_ROLE=integrante`, su correo y `MEMBER_ID=01|02|03|04`. Ningún usuario puede autoasignarse roles mediante la API pública. Configurar la URL de redirección de Auth para `https://nachodev-ui.github.io/gimae-web/admin/` y restringir el registro abierto si el panel será exclusivo del equipo.

El contenido exclusivo se muestra por ahora solo en el panel a su autora o a la admin. Más adelante puede abrirse a suscriptoras añadiendo cuentas de fans y una tabla de suscripciones/entitlements con políticas RLS y Storage que verifiquen vigencia; también puede integrarse un proveedor de pagos y actualizar esos derechos desde un webhook seguro. El campo `visibility` ya distingue público y exclusivo, sin login público ni pagos en esta etapa.

## Verificación de permisos

`scripts/audit-roles.sql` prepara tres identidades ficticias, posts propios y ajenos, imágenes y objetos de Storage en **una sola sentencia**. Su `AUDIT_RESULT` final es una excepción intencional que revierte toda la sentencia. Ejecutarlo solo en SQL Editor después de verificar que el texto completo del editor coincide con el archivo; la interfaz puede seleccionar un fragmento o mostrar solo unas líneas. No se ha logrado ejecutar esta prueba en producción durante el cierre: la revisión automática rechazó el envío por incertidumbre sobre el texto seleccionado. No atribuir resultados a esta prueba hasta ejecutarla y revisar los conteos de Auth después de ella.
