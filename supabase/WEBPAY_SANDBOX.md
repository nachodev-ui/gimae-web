# Webpay Plus: integración de prueba

Esta ruta solo usa el ambiente de integración de Transbank. Aunque las credenciales de integración son compartidas y están publicadas por Transbank, **no se guardan valores literales en el repositorio**: se inyectan mediante Supabase Secrets. Esto evita alertas de secretos de alta entropía y, sobre todo, evita que una futura credencial Live termine copiada al código por costumbre.

## Configurar credenciales de integración

Antes de desplegar o volver a desplegar las funciones Webpay:

1. Copia desde la documentación oficial de Transbank el código de comercio y la API Key del ambiente de integración.
2. Guárdalos en un archivo local ignorado por Git, por ejemplo `.env.webpay.local`:

   ```dotenv
   WEBPAY_INTEGRATION_COMMERCE_CODE=<codigo_de_integracion>
   WEBPAY_INTEGRATION_API_KEY=<api_key_de_integracion>
   ```

3. Desde la raíz del proyecto, carga esas variables en Supabase sin pegarlas en comandos, commits, issues o chats:

   ```powershell
   npx supabase secrets set --env-file .env.webpay.local
   ```

4. Verifica que el archivo siga sin trackearse con `git status --short`. El patrón `.env.*` ya está cubierto por `.gitignore`.
5. Recién entonces despliega `webpay-create-order`, `webpay-return` y `webpay-order-status`.

Las variables se llaman deliberadamente `WEBPAY_INTEGRATION_*`: este módulo permanece fijado al host de integración. **No reutilices estas variables para credenciales Live.** El paso a producción debe implementar configuración separada y revisión explícita.

Funciona en CLP y solo con retiro presencial; los costos y lugares de entrega siguen pendientes de Gimae.
## Probar desde la tienda

1. Actualiza tu rama con el `main` más reciente. Para una prueba local, ejecuta `python3 -m http.server 8000 --directory dist` desde la raíz del proyecto.
2. Abre `http://localhost:8000/shop.html?webpay-sandbox=1`. Si pruebas el sitio publicado después de integrar esta rama, usa `https://nachodev-ui.github.io/gimae-web/shop.html?webpay-sandbox=1`.
3. Añade un producto activo con precio publicado, selecciona **Retiro en persona**, escribe nombre y contacto y elige **Webpay Plus · integración**. El inventario físico no limita los intentos de prueba.
4. Pulsa **Continuar a Webpay de prueba**. El importe debe mostrarse en pesos chilenos. Usa únicamente los datos de prueba de la [documentación oficial de Webpay Plus](https://www.transbankdevelopers.cl/documentacion/webpay-plus); por ejemplo, la tarjeta VISA `4051885600446623` y CVV `123` para probar una aprobación. Sigue las instrucciones de la página de integración para fecha, RUT y clave de prueba.
5. Al regresar, comprueba el resumen: **Prueba confirmada**, el mismo ID Webpay y el total CLP. Si la confirmación tarda, pulsa **Consultar confirmación**. Nunca repitas el pago mientras el estado esté verificándose.
6. En el SQL Editor de Supabase busca la orden que mostró la tienda:

   ```sql
   select id, payment_provider, order_environment, webpay_buy_order, status,
          webpay_authorization_code, reservation_state, stock_state,
          stock_allocations, fulfillment_status, paid_at
   from public.merch_orders
   where webpay_buy_order = 'REEMPLAZAR_POR_ID_DE_LA_TIENDA';
   ```

   Esperado para una compra nueva: `payment_provider = webpay`, `order_environment = test`, `status = paid`, código de autorización no vacío, `stock_state = not_applicable`, `stock_allocations = []` y `fulfillment_status = test`. No se descuenta ni aparta inventario físico. El pedido de prueba no aparece en «Pedidos pagados».

## Cancelación y vencimiento

- Haz una segunda prueba y vuelve desde Transbank sin autorizar. Consulta el pedido. No debe marcarse pagado. El intento de integración dura 9 minutos para terminar antes del límite aproximado de 10 minutos del formulario de Transbank. Cron lo deja `abandoned`, motivo `reservation_expired`; esta operación puede tardar aproximadamente un minuto adicional. Ninguna unidad queda apartada.
- La función de retorno acepta `GET ?token_ws=...` y `POST` de Transbank. Una respuesta HTTP 422 del commit exige consultar el estado remoto: si Webpay sigue en `INITIALIZED`, el pedido permanece pendiente para los reintentos acotados y, si no se resuelve, se muestra una alerta de revisión. Ese estado por sí solo no demuestra rechazo ni autorización.
- Si Transbank rechaza la transacción tras la confirmación del servidor, se verá `payment_denied`.
- Si una autorización llega después de vencer, se registra como `paid` de prueba y permanece fuera de preparación.

## Revisión técnica

- La migración `20261005233152_isolate_test_orders.sql` separa compras de prueba de reservas, descuentos y preparación. Conserva la historia de descuentos previos para auditoría. Consulta `scripts/audit-test-inventory.sql` y cuenta el inventario físico antes de restaurar unidades: el sistema no puede saber qué ajustes manuales se hicieron después.
- `webpay-return` confirma con Transbank y contrasta importe, orden, sesión y resultado. La actualización a `paid` de integración registra el pago sin tocar stock. PayPal Sandbox también queda aislado; PayPal Live futuro requiere `PAYPAL_ENV=live` y activa de nuevo la reserva transaccional.
- La conciliación usa `webpay-reconcile`: Cron la invoca cada minuto con un token aleatorio de Vault; consulta el estado por token y contrasta orden, sesión e importe. Si Transbank ya informa `AUTHORIZED` o `FAILED`, termina de registrar el resultado. Si sigue `INITIALIZED`, consulta de nuevo con pausas crecientes y después alerta en Backstage; **nunca intenta `commit` desde ese estado**. La confirmación por `commit` ocurre en `webpay-return`, tras el retorno que envía Transbank. Al resolverse una orden se borran los diagnósticos transitorios. La alerta «Pagos Webpay» es solo de lectura; el equipo debe verificar el ID en Transbank antes de decidir. No reintentar el cobro desde el panel.
- Orden de despliegue: migración `20261006001837_webpay_reconciliation.sql`, Edge Functions `webpay-return`, `webpay-order-status`, `webpay-reconcile`, y después `scripts/schedule-webpay-reconcile-sandbox.sql` en el proyecto **Sandbox**. Consulta `cron.job`, `cron.job_run_details` y `webpay_reconcile_*` para confirmar la actividad. El token no se pega en el repositorio ni en comandos.
- La compra `Gc3c83aaf696941879d91938c` aprobada tras esperar tres minutos ya terminó `paid` sin inventario físico. El antiguo trabajador registró un HTTP 422 durante la espera; la posterior confirmación normal tuvo éxito. El 6 de octubre, al bloquear `webpay-return` desde Firefox para `G0d703f2ec418475c97dab627`, Transbank informó `Transaction has an invalid finished state: aborted` a los intentos de `commit` anticipado; esa orden quedó pendiente y señalada para revisión. Se retiró el `commit` anticipado. Esto **no demuestra recuperación automática** si el retorno a nuestro servidor nunca ocurre: una consulta que sigue en `INITIALIZED` no permite confirmar el pago de forma segura. Antes de Live hay que aceptar este límite operativo, verificar el proceso de atención de alertas, configurar credenciales propias, revisar el contrato y completar la certificación. Si se exige confirmar automáticamente una aprobación sin retorno, ese mecanismo específico sí requiere una garantía de Transbank.

## Atención de una orden en revisión

Cuando Backstage muestre **Revisión manual**, el pedido sigue sin pago confirmado. La tienda muestra el ID Webpay y un botón para volver a consultar el estado; el comprador puede copiar un mensaje con ambos códigos y abrir los canales de contacto publicados.

1. Busca la orden en Transbank y compara ID, importe, fecha y resultado. Una alerta, un HTTP 422 o `INITIALIZED` por sí solos no prueban aprobación ni rechazo.
2. Mantén el pedido en pausa. No lo prepares, no cambies `paid` manualmente y no pidas al comprador que repita el pago mientras el resultado sea incierto.
3. Si Transbank informa `AUTHORIZED` con `response_code = 0` y datos coincidentes pero Gimae no refleja el pago, deriva la conciliación técnica de ese mismo token; si informa `FAILED` o `REVERSED`, registra el resultado verificado antes de recomendar otro intento. Si hay discrepancias, escala el caso.
4. Copia desde **Pagos Webpay** la respuesta sugerida para ese pedido. En Sandbox indica que no hubo dinero real. Para Live, explica que Transbank prevé reversa de transacciones no confirmadas, sin asegurar que este intento ya se revirtió ni prometer el plazo del banco. Solicita únicamente ID, fecha, importe y comprobante; nunca claves ni número completo de tarjeta.

Mensaje base para Live, sujeto al estado verificado: «Hola, estamos revisando tu pedido <ID_PEDIDO> y orden Webpay <ID_WEBPAY>. Nuestra tienda todavía no tiene un resultado concluyente de Transbank, así que no consideramos el pedido pagado ni lo prepararemos. Por favor, no inicies otro pago por ahora. Si tu banco muestra un cargo, guarda el comprobante y envíanos la fecha y el importe. No envíes claves ni el número completo de tu tarjeta. Transbank indica que las transacciones que no se confirman se reversan; primero debemos verificar si eso ocurrió en este intento y no podemos asegurar cuándo se verá en tu banco. Te informaremos cuando tengamos un resultado verificado».

La tarea automática realiza consultas acotadas. Tras la alerta, el comprador puede volver a consultar este pedido; esa consulta solo puede registrar un resultado concluyente que Transbank entregue para el mismo token. Ninguna consulta a `INITIALIZED` intenta `commit`. Si Webpay nunca comunica una decisión, el caso sigue en revisión del equipo.


## Verificación y alcance de la conciliación

1. Las pruebas locales automatizadas (`node --experimental-strip-types supabase/functions/_shared/webpay-reconcile.test.mjs`) verifican que `INITIALIZED` nunca activa `commit`, que los estados concluyentes y las identidades de orden se clasifican correctamente y que no hay `PUT` en el trabajador. La ejecución de Cron y la consulta SQL sobre la orden abortada permiten comprobar que se mantiene la alerta sin un nuevo intento de confirmación.
2. En la tienda, una orden con alerta debe mostrar «Necesitamos revisar este pago» y el ID Webpay, sin afirmar que fue cobrada o rechazada. El botón «Consultar confirmación» puede detectar una resolución posterior. La compra normal de tres minutos ya fue probada; no se pide repetirla para esta corrección.
3. **No repitas el bloqueo de `webpay-return` como prueba de pago aprobado sin retorno**: produjo una transacción abortada en integración. Si el servidor no recibe el retorno y Transbank sigue mostrando `INITIALIZED`, el resultado seguro es alerta y revisión. La recuperación automática solo está cubierta cuando la API entrega un estado concluyente o cuando el retorno llegó al servidor pero se perdió la respuesta al navegador.
4. Solo si se exige confirmación automática sin retorno, la pregunta para Transbank es: «Para Webpay Plus, si el navegador nunca alcanza `return_url` después de que el comprador aprueba, ¿existe una señal o mecanismo documentado que permita al comercio distinguir autorización resuelta de `INITIALIZED` y efectuar `commit` sin ese retorno? ¿Qué respuesta debería esperarse de `Transaction.status()` y cuál es el procedimiento de conciliación recomendado?» La respuesta define si es posible automatizar ese caso.

Diagnóstico SQL (no incluye token ni datos de tarjeta):

```sql
select webpay_buy_order,status,order_environment,stock_state,
       webpay_reconcile_attempts,webpay_commit_attempts,webpay_last_reconciled_at,
       webpay_reconcile_error,webpay_reconcile_alert_at,webpay_reconcile_alert_reason
from public.merch_orders
where webpay_buy_order='REEMPLAZAR_POR_LA_ORDEN_WEBPAY';
```

Referencias: [API de Webpay Plus, Transbank Developers](https://github.com/TransbankDevelopers/transbank-developers-docs/blob/master/referencia/webpay/README.md), [documentación de integración y tarjetas de prueba](https://www.transbankdevelopers.cl/documentacion/webpay-plus).
