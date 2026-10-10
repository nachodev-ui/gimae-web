# Modelo de inventario de Merch

## Regla de negocio

El sistema usa **una sola fuente de verdad** según la estructura del producto.

### Producto sin variantes

Ejemplo: un artículo que se vende como una sola opción.

- `products.stock` = unidades disponibles.
- `products.stock_confirmed` = indica si ese conteo fue revisado físicamente.
- El stock se edita en el bloque general del producto.

### Producto con variantes

Ejemplo: Poleras estampadas por integrante/color.

- `product_variants.stock` y `product_variants.stock_confirmed` son la fuente de verdad.
- No existe un segundo stock general que se reparta entre las variantes.
- `products.stock` se mantiene automáticamente como **suma de unidades confirmadas** de todas las variantes.
- `products.stock_confirmed` es `true` únicamente cuando **todas** las variantes están confirmadas.
- El panel muestra el stock general como resumen de solo lectura.
- La tienda nunca usa el total del producto como fallback para una variante concreta.

## Ejemplo

| Variante | Stock | Confirmado |
| --- | ---: | --- |
| Suki · Rosado | 2 | Sí |
| Usi · Rojo | 0 | No |
| Vewe · Amarillo | 0 | No |
| Vali · Morado | 0 | No |

Resumen automático en `products`:

- `stock = 2`
- `stock_confirmed = false`

La tienda interpreta:

- Suki: 2 unidades disponibles.
- Usi, Vewe y Vali: disponibilidad por confirmar.
- Nunca heredan las 2 unidades de Suki.

Si posteriormente las cuatro variantes quedan confirmadas, `products.stock_confirmed` pasa automáticamente a `true` y `products.stock` sigue representando la suma de sus unidades confirmadas.

## Postales

El producto `05` **Postales** reúne los diseños de Antigua, Halloween, Traje y Verano. Cada diseño es una variante con etiqueta `Colección · Diseño` (por ejemplo, `Verano · Suki` o `Antigua · 01`), imagen, precio y stock propios. El resumen de stock del producto se calcula con la misma regla de variantes descrita arriba. Las colecciones son filtros de la tienda, no productos separados.

## Protección de base de datos

La migración `202609290008_variant_inventory_source.sql` instala dos defensas:

1. Cada INSERT/UPDATE/DELETE en `product_variants` recalcula el resumen del producto padre.
2. Si alguien intenta editar manualmente `products.stock` o `products.stock_confirmed` para un producto que tiene variantes, PostgreSQL reemplaza esos valores por el resumen real de las variantes.

Al eliminar la última variante, el inventario general vuelve a `0 / sin confirmar`, para que no se herede accidentalmente el antiguo total agregado como si fuera stock independiente.
