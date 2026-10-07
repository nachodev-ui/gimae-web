# Gacha: sobres de regalo por pedido

Rama: `feature/gacha-order-rewards`. No requiere cuentas de clientes ni modifica el checkout o el inventario.

## Reglas

- Un pedido confirmado como `paid`, con `paid_at` y subtotal de productos **desde $2.000 CLP inclusive**, obtiene **3 sobres** por defecto. El envío no cuenta.
- Backstage → Gacha permite cambiar el mínimo (nunca menor a $2.000), elegir 2 o 3 sobres, renombrar Común/Rara/SSR y ajustar sus probabilidades. Deben sumar exactamente 100%.
- El canje por pedido es único en Postgres. Repetirlo desde la misma sesión recupera el saldo; no vuelve a otorgarlo. Otra sesión no puede apropiarse de un pedido canjeado.
- La categoría se sortea en el servidor con bytes criptográficos. Todas sus cartas activas tienen la misma posibilidad. Si falta una categoría con peso positivo, el juego entra en mantenimiento sin consumir créditos.
- La categoría con el menor peso positivo dispara la presentación especial. Si hay empate, todas las categorías empatadas son especiales. Categorías con 0% no se sortean.
- Los pedidos Sandbox no califican por defecto. Activa la opción de prueba solo para probar y desactívala antes de abrir la promoción pública.
- Cambiar la cantidad de sobres no altera créditos ya concedidos. El estado pagado se verifica también al abrir un sobre. Cambiar el mínimo no retira créditos previamente concedidos.

## Sin login

El código UUID del comprobante permite el primer canje. Es un código al portador: alguien que lo conozca podría canjearlo antes que el comprador. No se presenta como verificación de identidad.

Al canjear se vinculan los sobres a un token aleatorio de 256 bits guardado en ese navegador/origen. El servidor guarda solo su hash. El historial y saldo se recuperan al recargar, incluso si se interrumpió una tirada. Cada tirada conserva su ID hasta obtener y sincronizar una respuesta; los reintentos no descuentan otro sobre.

Borrar los datos del navegador pierde el token y puede dejar los créditos inaccesibles. Cambiar de dispositivo o entre localhost y GitHub Pages no traslada la sesión. No se pueden volver a canjear esos pedidos. Para una recuperación entre dispositivos se necesitaría otro mecanismo de autenticación o un procedimiento adicional del equipo.

La colección gratuita anterior se conserva como colección local. Las cartas de nuevas tiradas se sincronizan desde el servidor. No hay tiradas ilimitadas de respaldo si falla la API.

## Panel e imágenes

Backstage → Gacha tiene subida de JPG/PNG/WebP hasta 8 MB, selección o arrastre de archivo, vista previa, reemplazo, confirmación con imagen al quitar/eliminar, edición de nombre/frase/categoría/encuadre/zoom, ocultar y ordenar con flechas o arrastre. El orden solo afecta el álbum.

El catálogo usa `gacha_cards` y las reglas `gacha_settings`, con RLS: lectura pública del catálogo activo y escritura exclusiva de cuentas autorizadas en `profiles`. Los créditos y tiradas están en el esquema privado, sin acceso desde navegador. El RPC transaccional solo es ejecutable por `service_role`, desde Edge.

Cada resultado conserva una copia de los datos e imagen de la carta al momento de la tirada. Los archivos subidos se conservan al reemplazar/eliminar cartas para que el historial no quede con imágenes rotas. No se borran imágenes históricas automáticamente.

## Compartir

Se genera un PNG vertical de 1080 × 1920 con la foto, nombre de integrante, categoría y marca Gimae. `Compartir imagen` usa el menú de compartir del sistema cuando admite archivos; `Descargar para Stories` permite subirlo manualmente a Instagram.

Una web no puede garantizar que Instagram aparezca en ese menú o que abra directamente el editor de Stories como una integración de app nativa. La disponibilidad depende del navegador y del teléfono. El PNG no incluye números de pedido ni datos de comprador.

## Activación del backend

La migración y función están preparadas en esta rama, **pendientes de aprobación para desplegar en el Supabase compartido**. Traer la rama y servir `dist` no crea automáticamente las tablas ni la función.

Archivos necesarios:

- `supabase/migrations/20261007172438_gacha_order_rewards.sql`
- `supabase/functions/gacha/index.ts`
- `supabase/functions/_shared/paypal.ts` (utilidades existentes; se conserva)
- `supabase/functions/deno.json` (dependencia fijada ya existente)
- `supabase/config.toml` (canje público sin cuenta, validación en cuerpo y servidor)

Después de aprobar, aplicar la migración al proyecto correcto y desplegar `gacha` usando su configuración. Reutiliza los secretos de Supabase y `PAYPAL_ALLOWED_ORIGINS` ya configurados. La función no necesita credenciales nuevas de pagos.

Prueba manual tras activación:

1. Activa temporalmente pedidos Sandbox en Backstage → Gacha.
2. Usa un pedido Sandbox pagado con productos desde $2.000; comprueba que concede 3 sobres.
3. Reintenta el mismo pedido: mantiene el saldo, no agrega sobres. En incógnito: rechaza el pedido ya canjeado.
4. Abre los tres sobres y confirma saldo 0. Recarga a mitad de una tirada para comprobar recuperación.
5. Prueba códigos inexistentes, pedidos sin pagar y subtotal menor al mínimo; deben ser rechazados.
6. Añade/reemplaza una carta, confirma eliminación con vista previa, cambia orden y nombres/probabilidades.
7. Comprueba que una categoría con 0% no sale y que la menor probabilidad obtiene la animación especial. Para probar la presentación sin depender del azar utiliza el test de navegador, que fuerza un resultado especial solo en su entorno aislado.
8. Descarga la Story y prueba el menú de compartir en un teléfono compatible.
9. Desactiva la opción Sandbox al terminar.

## Verificación automatizada

`tests/gacha-database.mjs` ejecuta **la migración real** en PGlite/Postgres aislado, con fixtures mínimos del esquema existente. Comprueba roles/RLS/Storage, mínimo inclusivo, Sandbox, canje único, agotamiento, reintentos, mantenimiento y resultados históricos. No sustituye una prueba de concurrencia con múltiples conexiones en el Supabase destino.

`tests/gacha-browser.cjs` ejecuta el JS real del juego y del módulo administrativo en Chromium; intercepta todas las solicitudes a Supabase. Comprueba recuperación tras respuesta perdida y recarga, un único débito, animación/modal, PNG de Stories, interfaz móvil, confirmaciones, subida, creación, eliminación, orden y configuración.

Dependencias temporales: `@electric-sql/pglite@0.5.8`, `playwright@1.62.1` (o el Playwright del entorno), Chromium compatible. No se añaden dependencias al sitio estático. Variables de test: `GACHA_TEST_MODULES` para node_modules, `GACHA_PLAYWRIGHT` y `GACHA_CHROMIUM` opcionales para rutas del entorno.

Verificación pendiente: aplicar/desplegar en Supabase compartido y probar allí un pedido real de Sandbox, junto con solicitudes concurrentes y compartir en Instagram desde un dispositivo físico.
