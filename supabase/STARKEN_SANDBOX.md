# Starken POR PAGAR: prueba del flujo

Starken es el único transporte habilitado en esta etapa y solo se ofrece **a domicilio, por pagar**. El checkout cobra los productos; la persona destinataria paga el transporte directamente a Starken al recibir el paquete. El equipo entrega el paquete físicamente en un punto Starken, obtiene la orden de flete y comparte manualmente una foto del comprobante y el número de seguimiento. [Modalidad oficial](https://www.starken.cl/distribucion) · [Condiciones del servicio](https://www.starken.cl/condiciones).

## Antes de probar

- Abre el sitio local con `python3 -m http.server 8000 -d dist`.
- Para Webpay integración usa `http://localhost:8000/shop.html?webpay-sandbox=1`; para PayPal Sandbox usa `?paypal-sandbox=1`.
- Usa únicamente datos ficticios de prueba y tarjetas/cuentas Sandbox. Un RUT de ejemplo que pasa el dígito verificador es `11111111-1`; el celular debe tener formato `+56912345678`. No envíes ningún paquete durante esta prueba.

## Recorrido de comprador y administración

1. Agrega un producto, selecciona **Starken · entrega a domicilio** y revisa que el carrito explique el cobro del transporte al recibir, fuera del total de productos.
2. Completa los datos del comprador y del destinatario: nombre, RUT, celular, correo, región, comuna, calle, número y, si corresponden, unidad e indicaciones. El formulario debe rechazar un RUT incorrecto o una dirección incompleta.
3. Aprueba un pago Sandbox/integración y espera la confirmación. El resumen debe indicar Starken POR PAGAR, destino y que la prueba no genera despacho real.
4. Abre **Backstage → Pedidos pagados → Practicar con Sandbox**. Busca la orden, comprueba el destino y abre los datos de flete. Avanza a **En preparación**, **Listo para Starken** y **Registrar entrega a Starken**. Ingresa un código ficticio, como `SIMULADO-123`.
5. Comprueba que quedó en **Finalizados en práctica**, muestra el código de ejemplo y no ofrece enviar avisos reales. Verifica que el stock no cambió. Un pedido con retiro conserva sus pasos propios y no pide número de flete.

Consulta opcional en SQL Editor (reemplaza el identificador):

```sql
select payment_provider, order_environment, status, delivery_method,
       shipping_clp, total_clp, stock_state, fulfillment_status,
       test_fulfillment_status, test_starken_waybill, starken_waybill
from public.merch_orders
where paypal_order_id = '<paypal_order_id>' or webpay_buy_order = '<webpay_buy_order>';
```

En Sandbox se esperan `order_environment = 'test'`, `delivery_method = 'starken_por_pagar'`, `shipping_clp = 0`, `stock_state = 'not_applicable'`, `fulfillment_status = 'test'`, `test_starken_waybill` informado solo al terminar la práctica y `starken_waybill` nulo. Los datos completos del destinatario solo se muestran en la bandeja para administradoras.

El archivo `tests/starken_por_pagar.sql` comprueba en una transacción con `ROLLBACK` ambos proveedores, el rechazo de datos incompletos y el bloqueo del despacho sin número de flete. El pago y el envío real no quedan simulados por esa prueba SQL: el navegador y el equipo deben comprobarlos con Sandbox antes de habilitar pagos Live.
