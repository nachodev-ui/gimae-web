# Backend Neon de Gimae

El frontend sigue siendo estático. `dist/neon-config.js` solo contiene la URL HTTPS **sin credenciales** de Neon y la URL pública de la Function; las credenciales S3 y Postgres quedan en el entorno de ejecución, fuera de Git.

## Servicios y puesta en marcha

Se requiere un proyecto Neon en **AWS us-east-2** (Object Storage beta), con Auth (Managed Better Auth), Data API, dos buckets (`gimae-products`: `public_read`; `gimae-blog`: `private`) y la Function `gimaemedia`. Esta última verifica JWTs para las escrituras y sirve anónimamente solo imágenes pertenecientes a posts públicos publicados. El bucket privado impide que un enlace directo revele las imágenes exclusivas. No habilitar registro público desde la interfaz: solo las cuentas con perfil en `public.profiles` acceden al panel.

1. Vincular el proyecto/branch con Neon CLI (`neon link`), instalar dependencias **en esta carpeta** (`npm install`) y aplicar `neon deploy` sobre el branch deseado. `neon.ts` declara los servicios. Configurar el dominio confiable `https://nachodev-ui.github.io` en Neon Auth.
2. Ejecutar, con `DATABASE_URL_UNPOOLED` de esa misma rama, `psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f migrations/202609280001_gimae.sql`, luego las migraciones `0002` y `0003` en orden. La primera espera los roles `anonymous` y `authenticated` y la función `auth.user_id()` creados por la Data API. Actualizar su caché de esquema después de aplicar migraciones.
3. `npm run seed:generate` desde `neon/` vuelve a generar el seed a partir de `dist/content.js` (equivalente desde la raíz: `node neon/scripts/build-seed.mjs`). Ejecutar `0002` una sola vez; es idempotente sobre IDs existentes y no sobrescribe ediciones del panel.
4. Desde `neon/`, con las variables `AWS_*` y `DATABASE_URL_UNPOOLED` del **mismo branch** (`neon env pull`), ejecutar `npm run images:upload`. Sube todos los assets de `dist/images` y cambia las URL de retratos y merch en la base solo si la carga completa termina correctamente. Los archivos estáticos se mantienen en `dist` como respaldo.
5. Rellenar `dist/neon-config.js` con `databaseUrl` HTTPS (por ejemplo `https://ep-...neon.tech/neondb`, nunca `postgresql://...`) y `mediaUrl` de la Function. Verificar `psql "$DATABASE_URL_UNPOOLED" -f scripts/summary.sql`. Los posts y eventos parten vacíos; el stock parte en 0 **sin confirmar**.

## Primera administradora e integrantes

Crear la primera cuenta con la herramienta `create_auth_user` de Neon usando el **correo elegido por el equipo**; no colocar una contraseña en el repositorio. Tomar el ID de usuario devuelto y, con las variables `TEAM_USER_ID`, `TEAM_EMAIL`, `TEAM_ROLE=admin` y `DATABASE_URL_UNPOOLED`, ejecutar `npm run user:enroll`. La cuenta debe establecer su contraseña mediante el flujo de Auth. Para integrantes, repetir con `TEAM_ROLE=integrante` y `MEMBER_ID` (`01`, `02`, `03` o `04`). El cliente jamás puede autoasignarse un rol. La Function y RLS consultan roles en la base, no en variables manipulables del navegador.

El panel está en `dist/admin/`. La aplicación pública solo consulta contenido habilitado. Publicar contenido **exclusivo** para fans requiere después una identidad para suscriptoras y una autorización verificable (por ejemplo una tabla de suscripciones con vigencia y una política RLS); por ahora solo pueden verlo administradoras y la autora en el panel.

**Límites actuales:** el carrito y checkout existentes siguen siendo locales, no reservan inventario ni confirman pagos. Cuando una API falle, la web usa el catálogo local y avisa que hay que confirmar precios y disponibilidad por Instagram. El acceso con sesión de Neon Auth desde GitHub Pages debe probarse en navegadores que bloquean cookies de terceros; si hay problemas, se requerirá un dominio propio y un proxy de Auth bajo el mismo sitio. Las credenciales de Neon no deben guardarse en `dist` ni en Git.
