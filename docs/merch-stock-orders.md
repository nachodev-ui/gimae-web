# Stock y preparación de pedidos · Sandbox

## Regla de inventario

- Crear la orden aparta las unidades durante 15 minutos en una transacción PostgreSQL. El servidor bloquea producto y variante, comprueba precio y disponibilidad después de los bloqueos e inserta pedido y líneas reservadas de forma atómica. La tienda muestra la hora de vencimiento. El stock físico no baja hasta que el pago es confirmado.
- Cron vence cada minuto los intentos `held` que no empezaron a capturarse y libera su disponibilidad. Una orden anulada por PayPal se libera cuando el conciliador lo comprueba. La toma `capturing` mantiene las unidades protegidas hasta conocer el resultado remoto: un fallo de red no debe liberarlas mientras PayPal aún podría cobrar. Navegador, webhook y conciliador llaman a la misma toma transaccional; después del plazo nunca solicitan una captura nueva. Los reintentos usan la misma `PayPal-Request-Id`.
- La primera transición verificada a `paid` bloquea las filas de inventario, descuenta unidades y guarda `stock_allocations` en la misma transacción. Webhook, retorno y conciliación convergen en esa transición. Un reintento de `paid` no descuenta otra vez.
- Para productos sin variantes se descuenta `products.stock`; con variantes se descuenta la fila de `product_variants`. El trigger existente recalcula el resumen del producto.
- Si una captura real llega después de vencida la reserva, prevalece el pago confirmado: `reservation_issue=late_capture` y `on_hold`. El inventario se asigna solo en la medida que no quite unidades de otras reservas activas. El equipo debe revisar esa venta antes de prepararla; si faltan unidades, repone y pulsa **Volver a revisar stock**. La revisión de un pago tardío exige una nota y queda fechada y asociada a la cuenta del Backstage.
- Los cuatro pagos Sandbox previos a la migración se marcaron `legacy_review/on_hold`. No se descuentan retroactivamente para evitar contar dos veces unidades que pudieron entregarse. Revisar su historial y existencias manualmente.

## Trabajo del equipo

En Backstage → **Pedidos pagados** se muestran los últimos 100 pagos confirmados. La tarjeta presenta comprador, contacto, productos, unidades asignadas y siguiente paso; la nota interna y los identificadores técnicos se consultan al desplegar los detalles. Las categorías separan trabajo pendiente, pedidos que necesitan atención, entregados y ventas anteriores al control de stock. Los intentos sin confirmar siguen en **Pagos PayPal**.

El recorrido es **Por preparar → En preparación → Listo para retiro → Entregado**. Cada tarjeta muestra el siguiente paso y confirma visualmente el resultado. La entrega exige una confirmación adicional y no envía un aviso automático al comprador. En las tres primeras etapas se puede poner un pedido en revisión con un motivo interno; se reanuda desde **Por preparar** cuando el stock está asignado. Guarda cualquier nota antes de cambiar de etapa. La API solo permite al equipo actualizar `fulfillment_status` y `fulfillment_note`; no permite modificar pago, importes, líneas ni asignaciones.

Para un pedido con faltante, confirma y repón el inventario en Merch, luego pulsa **Volver a revisar stock**. La función autenticada asigna solo la cantidad aún pendiente y respeta otras reservas activas. No acepta solicitudes anónimas y la función SQL de reasignación solo admite `service_role`. Si fue un pago tardío, usa **Revisar y autorizar** después de completar el stock. Los pedidos `legacy_review` no se reasignan automáticamente. Hoy cualquier cuenta con perfil autorizado en Backstage puede hacer esta revisión; no hay un rol separado por etapa en `profiles`.

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

5. Ejecuta `supabase/scripts/test-merch-reservations.sql` en Sandbox para probar última unidad, vencimiento, rechazo de captura, pago tardío, idempotencia y ausencia de descuento previo al pago. El script usa `ROLLBACK`. Se ensayaron además dos transacciones simultáneas contra una variante de una unidad: solo una reserva se confirmó; el pedido de prueba se eliminó inmediatamente después.

6. Prueba manualmente dos intentos Sandbox: uno aprobado antes de los 15 minutos para confirmar el recorrido normal y otro que dejes vencer sin aprobar. Tras el vencimiento, el segundo debe quedar `abandoned/reservation_expired`; una aprobación tardía no debe iniciar la captura. Una simulación SQL no equivale a un cobro real tardío: si PayPal llegara a confirmarlo, el webhook o la conciliación lo dejan pagado y en revisión.

La aceptación manual de ambos recorridos se completó el 1 de octubre de 2026 (Chile): la compra aprobada quedó `paid/consumed/allocated`, con una captura y una unidad descontada; el intento sin aprobar quedó `abandoned/expired/reservation_expired`, sin captura y sin descuento adicional. Tras ambos intentos, la variante conservó una unidad física y cero reservadas. La pantalla de reserva vencida presenta ahora el estado, una acción para regresar al carrito y los datos del intento en un panel desplegable.

El proyecto Sandbox tiene aplicada `20261001222122_merch_order_reservations` además de las migraciones de stock anteriores. Están desplegadas las funciones PayPal y `merch-reservation-review`; la tarea `gimae-merch-reservation-expiry` corre cada minuto y la conciliación PayPal conserva su frecuencia de dos minutos. La migración anterior `paypal_public_hardening` se renombró en el repositorio a `20261001165222` para que coincida con el historial existente de Sandbox. El origen de Pages y `http://localhost:8000` deben seguir presentes en `PAYPAL_ALLOWED_ORIGINS`. PayPal normal permanece desactivado para el público. Cancelaciones, reembolsos y el historial detallado de etapas requieren un flujo aparte antes de Live.
