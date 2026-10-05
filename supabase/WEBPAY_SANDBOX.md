# Webpay Plus: integración de prueba

Esta ruta solo usa el ambiente de integración y las credenciales públicas de prueba de Transbank. No tiene código para cobrar en producción. Funciona en CLP y solo con retiro presencial; los costos y lugares de entrega siguen pendientes de Gimae.

## Probar desde la tienda

1. Actualiza la rama `feature/webpay-sandbox`. Para una prueba local, ejecuta `python3 -m http.server 8000 --directory dist` desde la raíz del proyecto.
2. Abre `http://localhost:8000/shop.html?webpay-sandbox=1`. Si pruebas el sitio publicado después de integrar esta rama, usa `https://nachodev-ui.github.io/gimae-web/shop.html?webpay-sandbox=1`.
3. Añade un producto con stock confirmado, selecciona **Retiro en persona**, escribe nombre y contacto y elige **Webpay Plus · integración**.
4. Pulsa **Continuar a Webpay de prueba**. El importe debe mostrarse en pesos chilenos. Usa únicamente los datos de prueba de la [documentación oficial de Webpay Plus](https://www.transbankdevelopers.cl/documentacion/webpay-plus); por ejemplo, la tarjeta VISA `4051885600446623` y CVV `123` para probar una aprobación. Sigue las instrucciones de la página de integración para fecha, RUT y clave de prueba.
5. Al regresar, comprueba el resumen: **Prueba confirmada**, el mismo ID Webpay y el total CLP. Si la confirmación tarda, pulsa **Consultar confirmación**. Nunca repitas el pago mientras el estado esté verificándose.
6. En el SQL Editor de Supabase busca la orden que mostró la tienda:

   ```sql
   select id, payment_provider, webpay_buy_order, status,
          webpay_authorization_code, reservation_state, stock_state,
          fulfillment_status, paid_at
   from public.merch_orders
   where webpay_buy_order = 'REEMPLAZAR_POR_ID_DE_LA_TIENDA';
   ```

   Esperado: `payment_provider = webpay`, `status = paid`, código de autorización no vacío y stock descontado una sola vez. El pedido de prueba aparecerá identificado como tal en el Backstage; no se prepara ni entrega físicamente.

## Cancelación y vencimiento

- Haz una segunda prueba y vuelve desde Transbank sin autorizar. Consulta el pedido. No debe marcarse pagado. La reserva de integración dura 9 minutos para terminar antes del límite aproximado de 10 minutos del formulario de Transbank. Cron la libera y lo deja `abandoned`, motivo `reservation_expired`; esta operación puede tardar aproximadamente un minuto adicional.
- La función de retorno acepta `GET ?token_ws=...` y `POST` de Transbank. Una respuesta HTTP 422 del commit exige consultar el estado remoto: si Webpay sigue en `INITIALIZED`, el pedido se cierra sin marcarse pagado y libera stock. Ante incertidumbre permanece pendiente para revisión.
- Si Transbank rechaza la transacción tras la confirmación del servidor, se verá `payment_denied` y se liberará la reserva.
- Si una autorización llega después de vencer, la venta se registra como `paid` y `reservation_issue = late_capture`; el pedido queda `on_hold` para revisión antes de prepararlo.

## Revisión técnica

- La migración `20261005000100_webpay_sandbox.sql` ya está aplicada en el proyecto Sandbox. El mismo bloqueo transaccional de inventario cubre pedidos PayPal y Webpay. La prueba de base de datos `scripts/test-webpay-reservations.sql` se ejecutó en una transacción con `ROLLBACK` y dejó stock intacto.
- Las Edge Functions `webpay-create-order`, `webpay-return` y `webpay-order-status` ya están desplegadas. `webpay-return` confirma con Transbank, contrasta importe, orden, sesión y resultado, y la actualización a `paid` dispara la asignación única de inventario.
- Todavía falta la prueba completa en navegador con aprobación y cancelación reales de integración. Este trabajo no habilita Webpay Live. Antes de Live hay que configurar credenciales propias, revisar el contrato comercial, certificar el flujo, automatizar la conciliación de retornos que nunca llegan y separar los pedidos de prueba de la operación real.

Referencias: [API de Webpay Plus, Transbank Developers](https://github.com/TransbankDevelopers/transbank-developers-docs/blob/master/referencia/webpay/README.md), [documentación de integración y tarjetas de prueba](https://www.transbankdevelopers.cl/documentacion/webpay-plus).
