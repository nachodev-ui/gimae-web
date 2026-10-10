# Fuente de verdad de imágenes

## Regla

| Tipo | Fuente de verdad | URL pública |
| --- | --- | --- |
| Imágenes fijas del sitio, retratos de respaldo, avatar, merch de referencia y composición Goodies | `dist/images/`, versionado en Git | `/gimae-web/images/...` en GitHub Pages |
| Fotografías cargadas desde Backstage, incluidas galerías de productos y postales de tienda | Supabase Storage, bucket `gimae-products`, ruta `products/...` | URL pública de Storage guardada en `product_images.url` o `product_variants.image_url` |
| Retratos nuevos cargados desde Backstage | Supabase Storage, bucket `gimae-members`, ruta `members/...` | URL guardada en `members.photo_url` |
| Imágenes del blog | Bucket privado `gimae-blog`, ruta `posts/...` | Referencia `storage:gimae-blog/...`; el sitio solicita URL firmada |
| Cartas de Gacha | Bucket `gimae-gacha`, ruta `cards/...` | URL almacenada para la carta |

No se suben imágenes fijas del repositorio a `gimae-products/images/`. La política de Storage solo admite nuevas cargas y actualizaciones administrativas bajo `products/`. Una imagen editada desde Backstage vive en Storage; no se copia a Git de forma automática.

## Goodies

Los 13 archivos de `dist/images/goodies/` son los recursos originales separados del catálogo: cuatro estampados, cuatro llaveros individuales y cinco postales. `dist/goodies-showcase.js` los usa en la portada y en el modal. El ZIP `Gimae-Goodies-assets.zip` entregado el 10 de octubre de 2026 contiene exactamente los mismos archivos que la rama `feature/goodies-originals-three-layouts`; el árbol de Git quedó limpio después de extraerlo. El ZIP es material de entrega, no una segunda fuente de verdad.

Los archivos de `dist/images/merch/` son referencias estáticas de la tienda. Las postales con variantes `600`, `1600` y `3000` de `gimae-products/products/postales/optimizadas/` son otra colección de imágenes, administrada en Storage, y no equivalen a las cinco postales de la composición Goodies.

## Estado del legado y transición

Inventario del proyecto `hvaonobbpzbupanuymkh` al 10 de octubre de 2026:

- `gimae-products/images/`: 31 copias antiguas de recursos estáticos, 9.898.765 bytes. Se conservan como legado para evitar una eliminación destructiva. La migración `canonical_image_sources` cambia las 13 referencias activas de retratos, galería y variantes que apuntaban a ese prefijo hacia GitHub Pages.
- `gimae-products/products/`: 47 objetos, 16.624.849 bytes. Incluye fotografías de poleras y postales de tienda. Hay un duplicado histórico en `products/postales/postal_antigua_01-600.webp`; el código actual utiliza `products/postales/optimizadas/`.

No se debe borrar un objeto solo porque parezca duplicado: primero comprobar referencias en `members.photo_url`, `product_images.url`, `product_variants.image_url`, posts y código. La limpieza de `images/` y del duplicado histórico requiere una decisión aparte, según la regla de operaciones destructivas de `AGENTS.md`.

## Al añadir o cambiar una imagen

1. Si es parte fija del diseño, editar `dist/images/` en una rama, usar una ruta relativa en el frontend y publicar mediante Git. Conservar originales, proporciones y nombres descriptivos. No subirla a Storage.
2. Si Backstage debe poder reemplazarla sin despliegue, cargarla en el bucket y ruta de su módulo. Guardar su URL en la fila correspondiente. No agregar una copia paralela a `dist/images/`.
3. Antes de reemplazar una URL, revisar su uso y conservar la imagen anterior hasta verificar la nueva referencia. El respaldo `dist/content.js` sigue usando rutas locales cuando falla Supabase.
