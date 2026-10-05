# Stock y preparación de pedidos

Tras `20261005230116_isolate_test_orders.sql`, PayPal Sandbox y Webpay integración son pedidos `test`: registran pagos sin reservar ni descontar inventario físico y no entran en preparación. Las reglas de inventario descritas a continuación corresponden a `live`.

## Regla de inventario

- Crear la orden aparta las unidades durante 15 minutos en una transacción PostgreSQL. El servidor bloquea producto y variante, comprueba precio y disponibilidad después de los bloqueos e inserta pedido y líneas reservadas de forma atómica. La tienda muestra la hora de vencimiento. El stock físico no baja hasta que el pago es confirmado.
- Cron vence cada minuto los intentos `held` que no empezaron a capturarse y libera su disponibilidad. Una orden anulada por PayPal se libera cuando el conciliador lo comprueba. La toma `capturing` mantiene las unidades protegidas hasta conocer el resultado remoto: un fallo de red no debe liberarlas mientras PayPal aún podría cobrar. Navegador, webhook y conciliador llaman a la misma toma transaccional; después del plazo nunca solicitan una captura nueva. Los reintentos usan la misma `PayPal-Request-Id`.
- La primera transición verificada a `paid` bloquea las filas de inventario, descuenta unidades y guarda `stock_allocations` en la misma transacción. Webhook, retorno y conciliación convergen en esa transición. Un reintento de `paid` no descuenta otra vez.
- Para productos sin variantes se descuenta `products.stock`; con variantes se descuenta la fila de `product_variants`. El trigger existente recalcula el resumen del producto.
- Si una captura real llega después de vencida la reserva, prevalece el pago confirmado: `reservation_issue=late_capture` y `on_hold`. El inventario se asigna solo en la medida que no quite unidades de otras reservas activas. El equipo debe revisar esa venta antes de prepararla; si faltan unidades, repone y pulsa **Volver a revisar stock**. La revisión de un pago tardío exige una nota y queda fechada y asociada a la cuenta del Backstage.
- Las asignaciones de prueba anteriores se conservan para auditoría. Consulta `supabase/scripts/audit-test-inventory.sql` y compara con un conteo físico antes de corregir las existencias.

## Trabajo del equipo

En Backstage → **Pedidos pagados** se muestran los últimos 100 pagos confirmados del entorno `live`. La tarjeta presenta comprador, contacto, productos, unidades asignadas y siguiente paso; la nota interna y los identificadores técnicos se consultan al desplegar los detalles. Las categorías separan trabajo pendiente, pedidos que necesitan atención, entregados y ventas anteriores al control de stock. Los intentos sin confirmar siguen en **Pagos PayPal**.

El recorrido es **Por preparar → En preparación → Listo para retiro → Entregado**. Cada tarjeta muestra el siguiente paso y confirma visualmente el resultado. La entrega exige una confirmación adicional y no envía un aviso automático al comprador. En las tres primeras etapas se puede poner un pedido en revisión con un motivo interno; se reanuda desde **Por preparar** cuando el stock está asignado. Guarda cualquier nota antes de cambiar de etapa. La API solo permite al equipo actualizar `fulfillment_status` y `fulfillment_note`; no permite modificar pago, importes, líneas ni asignaciones.

Para un pedido con faltante, confirma y repón el inventario en Merch, luego pulsa **Volver a revisar stock**. La función autenticada asigna solo la cantidad aún pendiente y respeta otras reservas activas. No acepta solicitudes anónimas y la función SQL de reasignación solo admite `service_role`. Si fue un pago tardío, usa **Revisar y autorizar** después de completar el stock. Los pedidos `legacy_review` no se reasignan automáticamente. Hoy cualquier cuenta con perfil autorizado en Backstage puede hacer esta revisión; no hay un rol separado por etapa en `profiles`.

## Verificación después del aislamiento

1. Tras aplicar la migración, ejecuta `supabase/scripts/test-isolated-orders.sql` en el SQL Editor. Su `ROLLBACK` deshace todo: prueba que PayPal Sandbox y Webpay integración no afectan stock y que la ruta Live conserva bloqueo, reserva y descuento único. `test-merch-reservations.sql` ensaya adicionalmente pago tardío Live con otra reserva vigente.
2. Anota el stock de una variante. Compra una unidad Sandbox desde `http://localhost:8000/shop.html?paypal-sandbox=1` y espera `paid`. El stock debe mantenerse igual.
3. Consulta el pedido por UUID:

```sql
select id,status,paypal_capture_id,order_environment,stock_state,
       stock_allocations,fulfillment_status,paid_at
from public.merch_orders where id = '<UUID_PEDIDO>';
```

Debe mostrar `order_environment=test`, `stock_state=not_applicable`, `stock_allocations=[]` y `fulfillment_status=test`. El pedido no debe figurar en **Pedidos pagados**. Reenviar el webhook de captura tampoco debe descontar.

4. Repite la prueba con Webpay integración y comprueba el mismo resultado. Un intento que venza debe quedar `abandoned/reservation_expired` sin afectar stock.
5. Ejecuta la auditoría de asignaciones históricas y coteja los totales con el conteo físico y las correcciones manuales realizadas desde las pruebas. No sumes las cantidades históricas al stock sin esa comprobación.

La aceptación manual del 1 de octubre de 2026 probó la implementación anterior: una compra Sandbox pagada descontaba stock. No sirve como prueba de aceptación de esta separación; las compras de los pasos 2 y 4 deben repetirse tras desplegar los cambios.

PayPal normal permanece desactivado para el público. Webpay Live exige credenciales propias, certificación y conciliación automática de retornos sin navegador. Cancelaciones, reembolsos y un historial detallado de etapas siguen pendientes.
