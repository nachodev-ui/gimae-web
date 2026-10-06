-- Solo lectura. Ejecutar tras aplicar isolate_test_orders en el SQL Editor.
-- Los descuentos previos no prueban cuántas unidades físicas existen hoy.
SELECT o.payment_provider, a.value->>'productId' AS product_id,
       a.value->>'variantId' AS variant_id,
       sum((a.value->>'allocated')::integer) AS previously_deducted,
       count(*) AS paid_test_orders,
       array_agg(o.id ORDER BY o.paid_at) AS order_ids,
       max(CASE WHEN a.value->>'variantId' IS NULL THEN p.stock ELSE v.stock END) AS current_stock
FROM public.merch_orders o
CROSS JOIN LATERAL jsonb_array_elements(o.stock_allocations) a
LEFT JOIN public.products p ON p.id = a.value->>'productId'
LEFT JOIN public.product_variants v ON v.product_id = a.value->>'productId'
  AND v.id = a.value->>'variantId'
WHERE o.order_environment = 'test' AND o.status = 'paid'
GROUP BY o.payment_provider, a.value->>'productId', a.value->>'variantId'
ORDER BY product_id, variant_id, o.payment_provider;
