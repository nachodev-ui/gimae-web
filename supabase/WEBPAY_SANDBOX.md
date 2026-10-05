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
- La función de retorno acepta `GET ?token_ws=...` y `POST` de Transbank. Una respuesta HTTP 422 del commit exige consultar el estado remoto: si Webpay sigue en `INITIALIZED`, el intento se cierra sin marcarse pagado. Ante incertidumbre permanece pendiente para revisión.
- Si Transbank rechaza la transacción tras la confirmación del servidor, se verá `payment_denied`.
- Si una autorización llega después de vencer, se registra como `paid` de prueba y permanece fuera de preparación.

## Revisión técnica

- La migración `20261005230116_isolate_test_orders.sql` separa compras de prueba de reservas, descuentos y preparación. Conserva la historia de descuentos previos para auditoría. Consulta `scripts/audit-test-inventory.sql` y cuenta el inventario físico antes de restaurar unidades: el sistema no puede saber qué ajustes manuales se hicieron después.
- `webpay-return` confirma con Transbank y contrasta importe, orden, sesión y resultado. La actualización a `paid` de integración registra el pago sin tocar stock. PayPal Sandbox también queda aislado; PayPal Live futuro requiere `PAYPAL_ENV=live` y activa de nuevo la reserva transaccional.
- Las pruebas reales de aprobación y cancelación en el navegador ya se realizaron antes del aislamiento. Este cambio requiere repetir una aprobación Sandbox y confirmar que el stock de `products`/`product_variants` permanezca igual. No habilita Webpay Live: siguen pendientes las credenciales propias, el contrato, la certificación y la conciliación automática de retornos sin navegador.

Referencias: [API de Webpay Plus, Transbank Developers](https://github.com/TransbankDevelopers/transbank-developers-docs/blob/master/referencia/webpay/README.md), [documentación de integración y tarjetas de prueba](https://www.transbankdevelopers.cl/documentacion/webpay-plus).
