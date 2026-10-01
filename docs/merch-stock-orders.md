# Stock y preparación de pedidos · Sandbox

## Regla de inventario

- La creación de la orden comprueba stock confirmado, pero no reserva mientras el comprador decide en PayPal.
- La primera transición verificada a `paid` bloquea las filas de inventario, descuenta unidades y guarda `stock_allocations` en la misma transacción. Webhook, retorno y conciliación convergen en esa transición. Un reintento de `paid` no descuenta otra vez.
- Para productos sin variantes se descuenta `products.stock`; con variantes se descuenta la fila de `product_variants`. El trigger existente recalcula el resumen del producto.
- Si dos compras se superponen y el stock ya no alcanza, se asignan las unidades disponibles sin crear stock negativo. La venta sigue pagada, `stock_state=shortage` y la preparación queda `on_hold`. El equipo debe reponer o resolver el faltante; no debe prometer retiro antes.
- Los cuatro pagos Sandbox previos a la migración se marcaron `legacy_review/on_hold`. No se descuentan retroactivamente para evitar contar dos veces unidades que pudieron entregarse. Revisar su historial y existencias manualmente.

## Trabajo del equipo

En Backstage → **Pedidos pagados** se muestran los últimos 100 pagos confirmados. La tarjeta presenta comprador, contacto, productos, unidades asignadas y siguiente paso; la nota interna y los identificadores técnicos se consultan al desplegar los detalles. Las categorías separan trabajo pendiente, pedidos que necesitan atención, entregados y ventas anteriores al control de stock. Los intentos sin confirmar siguen en **Pagos PayPal**.

El recorrido es **Por preparar → En preparación → Listo para retiro → Entregado**. Cada tarjeta muestra el siguiente paso y confirma visualmente el resultado. La entrega exige una confirmación adicional y no envía un aviso automático al comprador. En las tres primeras etapas se puede poner un pedido en revisión con un motivo interno; se reanuda desde **Por preparar** cuando el stock está asignado. Guarda cualquier nota antes de cambiar de etapa. La API solo permite al equipo actualizar `fulfillment_status` y `fulfillment_note`; no permite modificar pago, importes, líneas ni asignaciones.

Para un pedido con faltante, confirma y repón el inventario en Merch, luego pulsa **Volver a revisar stock**. La función autenticada asigna solo la cantidad aún pendiente. No acepta solicitudes anónimas y la función SQL de reasignación solo admite `service_role`. Los pedidos `legacy_review` no se reasignan automáticamente.

## Verificación

1. Ejecuta `supabase/scripts/test-merch-stock-orders.sql` en el SQL Editor **Sandbox**. El `ROLLBACK` conserva los datos; verifica producto general, variante, reintento y faltante.
2. Anota el stock de la variante confirmada. Desde `http://localhost:8000/shop.html?paypal-sandbox=1`, compra **una** unidad con el buyer Sandbox y espera `paid`.
3. Comprueba en SQL Editor (sustituye el UUID del pedido):

```sql
select id,status,paypal_capture_id,stock_state,stock_allocations,
       fulfillment_status,paid_at,stock_processed_at
from public.merch_orders where id = '<UUID_PEDIDO>';
```

El stock de la variante debe bajar una unidad y `stock_allocations` debe mostrar exactamente una asignada. En Backstage → **Pedidos pagados**, comprueba la venta, avanza a preparación, a listo y registra la entrega; abre de nuevo el panel para comprobar persistencia. Reenviar `PAYMENT.CAPTURE.COMPLETED` no debe volver a descontar stock.

4. Para simular un faltante sin pagar otra vez, la prueba SQL reversible ya cubre la carrera. No manipules una captura real para crear un faltante. Si ocurre en una compra real, el equipo debe revisar la venta pagada y la reposición antes de reanudarla.

El proyecto Sandbox ya tiene aplicadas `20261001204746_merch_stock_orders`, `20261001205237_merch_stock_orders_scope_fix` y `20261001205636_merch_stock_lock_order`; la Edge Function `merch-stock-recheck` está desplegada. La migración anterior `paypal_public_hardening` se renombró en el repositorio a `20261001165222` para que coincida con el historial existente de Sandbox. El origen de Pages y `http://localhost:8000` deben seguir presentes en `PAYPAL_ALLOWED_ORIGINS`. PayPal normal permanece desactivado para el público.
