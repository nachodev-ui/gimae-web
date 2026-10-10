# Hoja de ruta de GIMAE

_Corte: 9 de octubre de 2026. Base: `main` actualizado. Análisis de solo lectura: archivos clave, historial y PR, metadatos de Supabase y fuentes oficiales. No se ejecutaron pruebas ni se hizo revisión visual._

## Estado actual en cinco líneas

1. El sitio está publicado como archivos estáticos de `dist/`; contenido, imágenes y varias funciones dependen de Supabase.
2. El panel administra contenido, Merch y Gacha; los sobres por pedido y su canje están implementados, pero falta validar recorridos completos con pedidos reales de prueba.
3. PayPal y Webpay están desactivados en la interfaz; la transferencia tampoco queda disponible mientras sus datos sigan como `COMPLETAR`.
4. Las migraciones locales coinciden con el historial remoto y todas las tablas base inspeccionadas tienen RLS activado; eso no demuestra que cada política sea correcta.
5. Hay controles de accesibilidad y pruebas puntuales, pero faltan mediciones móviles, validación operativa de pagos y una puerta de CI que ejecute esas pruebas.

## Evidencia y límites del análisis

### Verificado en código y consultas de solo lectura

- **Funcionalidades.** [`dist/content.js`](../dist/content.js) mantiene `paypal.enabled` y `webpay.enabled` en `false`, los datos bancarios como `COMPLETAR` y textos del avatar aún por completar. [`dist/shop.js`](../dist/shop.js) exige que esos datos bancarios estén completos. [`dist/shop.html`](../dist/shop.html) todavía presenta condiciones de compra, cambios y devoluciones como plantillas pendientes de revisión. La implementación de recompensas y el umbral **real de $2.000 CLP** están documentados en [`GACHA_REWARDS.md`](GACHA_REWARDS.md) y en la migración [`20261008022035_gacha_order_rewards.sql`](../supabase/migrations/20261008022035_gacha_order_rewards.sql); el flujo usa códigos de pedido y un token guardado en el navegador.
- **Pagos.** Los parámetros explícitos de Sandbox están en [`dist/shop.js`](../dist/shop.js). PayPal elige entorno mediante `PAYPAL_ENV` en [`paypal.ts`](../supabase/functions/_shared/paypal.ts); Webpay apunta a integración y toma `WEBPAY_INTEGRATION_COMMERCE_CODE` y `WEBPAY_INTEGRATION_API_KEY` de secretos del entorno en [`webpay.ts`](../supabase/functions/_shared/webpay.ts). [`paypal-sandbox.md`](paypal-sandbox.md) y [`supabase/WEBPAY_SANDBOX.md`](../supabase/WEBPAY_SANDBOX.md) registran tareas de lanzamiento y recuperación de transacciones. Los requisitos externos se deben cotejar con las guías oficiales de [PayPal para producción](https://developer.paypal.com/api/rest/production/) y [Transbank para integración y producción](https://transbankdevelopers.com/documentacion/como_empezar).
- **Seguridad y datos.** `supabase migration list` mostró las migraciones locales alineadas con las remotas. La consulta de metadatos mostró RLS activo en **17/17** tablas base de `public` y **8/8** de `storage`. `gimae-blog` es privado; `gimae-gacha`, `gimae-members` y `gimae-products` son públicos para lectura de imágenes, con escritura restringida según las políticas revisadas. Los asesores de Supabase señalaron `pg_net` en `public`, protección de contraseñas filtradas desactivada y ocho tablas RLS sin políticas; estas últimas se usan de forma privada o mediante funciones y requieren revisión de intención, no una apertura automática. La [guía del asesor para extensiones](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) y la [guía de protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) describen esos hallazgos.
- **GitGuardian.** El archivo actual [`webpay.ts`](../supabase/functions/_shared/webpay.ts) no contiene la clave de integración literal: usa variables de entorno. El [PR #13](https://github.com/nachodev-ui/gimae-web/pull/13) retiró la credencial compartida de integración y su control GitGuardian terminó correctamente. La API de alertas abiertas de **GitHub Secret Scanning** devolvió cero resultados. **No se pudo comprobar si el incidente original sigue abierto en GitGuardian**: su panel exige una sesión autenticada. El resultado de GitHub y el control del PR no equivalen al [estado del incidente en GitGuardian](https://docs.gitguardian.com/internal-monitoring/detect/incident-statuses).
- **Experiencia y rendimiento.** El código incluye `aria-live`, foco visible, consultas de ancho y `prefers-reduced-motion` en varias vistas; no se validó su experiencia real con teclado, lector de pantalla o móvil. Los **32 archivos de `dist/images/` pesan 9,91 MB sin comprimir**; cuatro PNG de Merch concentran 6,58 MB. Los JS estáticos suman 624 KB y los CSS 421 KB sin comprimir; [`dist/styles.css`](../dist/styles.css) ocupa 142 KB y [`dist/shop.js`](../dist/shop.js) 87 KB. Las referencias estáticas de [`dist/shop.html`](../dist/shop.html) suman unos 244 KB de JS y 169 KB de CSS antes de compresión, caché y carga dinámica. Son tamaños de archivos, **no** datos transferidos ni tiempos medidos. La galería ya usa carga diferida para miniaturas.
- **Mantenimiento.** [`validate-static.yml`](../.github/workflows/validate-static.yml) revisa secretos, sintaxis de JS bajo `dist/` y enlaces locales, pero no ejecuta las pruebas existentes de Gacha, avatar, pagos o SQL. [`deploy-pages.yml`](../.github/workflows/deploy-pages.yml) publica `dist/` al hacer push a `main`. [`README.md`](../README.md) aún describe el Gacha como gratuito y local; [`GACHA_REWARDS.md`](GACHA_REWARDS.md) conserva referencias a la rama de desarrollo y a controles de orden ya cambiados.

### Pendiente de confirmar; no se presenta como hecho

- Estado **abierto o cerrado** del incidente en el panel de GitGuardian y clasificación de la credencial detectada. Requiere acceso del propietario al incidente; no se deben pegar secretos en tickets ni documentación.
- Contratos, habilitación comercial, credenciales Live, webhooks, conciliación, devoluciones y políticas legales aceptadas para cobrar de verdad. El código por sí solo no demuestra esos acuerdos.
- Corrección integral de políticas RLS, comportamiento ante concurrencia y fallos de red, accesibilidad efectiva, peso transferido y velocidad en móviles. Esta revisión no ejecutó pruebas ni abrió la web visualmente.
- Inventario físico vendible: la consulta mostró **5 productos** y **14 variantes**, con stock confirmado en 3 productos y 13 variantes; las cifras no sustituyen una conciliación física por variante.

## Hoja de ruta

**Esfuerzo:** S = pequeño, M = mediano, L = grande. **Riesgo:** posible impacto o incertidumbre si se ejecuta sin validar el requisito indicado. Cada fase incluye tareas de las seis áreas; hay **17 ítems** en total.

### Ahora

| ID | Qué | Por qué importa | Esfuerzo | Riesgo | Dependencias |
| --- | --- | --- | :---: | --- | --- |
| A1 | Resolver los `COMPLETAR` públicos y revisar las condiciones de compra, cambios, devoluciones y atención. | Evita promesas incompletas antes de admitir pagos reales. | M | Alto: publicar datos o condiciones incorrectos. | Datos del negocio y revisión legal/comercial. |
| A2 | Confirmar en GitGuardian el estado y alcance del incidente de `webpay.ts`; documentar su clasificación y acción apropiada. | El código actual está saneado, pero se desconoce el estado de la alerta original. | S | Alto: confundir un control exitoso con incidente cerrado o rotar sin investigar. | Propietario con acceso al panel de GitGuardian e historial de uso de la clave. |
| A3 | Revisar políticas RLS y buckets por rol y justificar los hallazgos del asesor, incluidos `pg_net` y protección de contraseñas filtradas. | RLS activado y buckets públicos previstos no bastan para demostrar permisos correctos. | M | Alto: exponer datos o interrumpir funciones al ajustar políticas. | Matriz de roles, asesor Supabase y ventana de cambios si procede. |
| A4 | Validar en Sandbox los recorridos de Gacha y pagos: canje único, límite de $2.000, tirada, concurrencia, retorno fallido y conciliación. | El camino feliz del código no cubre duplicados ni transacciones interrumpidas. | M | Alto: sobres o cobros inconsistentes. | Pedidos de prueba, accesos de Sandbox y plan de reversión; sin habilitar Live. |
| A5 | Priorizar y optimizar los cuatro PNG pesados de Merch, preservando calidad y dimensiones; establecer presupuesto móvil medido. | Concentran alrededor de dos tercios de las imágenes locales. | M | Medio: pérdida visual o referencias rotas. | Originales, aprobación visual y medición en red móvil futura. |
| A6 | Ampliar CI para ejecutar las pruebas existentes de Gacha, avatar y conciliación de pagos, más los controles de sintaxis y secretos ya presentes. | Los cambios pueden publicar `dist/` sin pasar por esas regresiones. | M | Medio: pruebas inestables o secretos de test mal gestionados. | Separar pruebas sin red de las que requieren Supabase/Sandbox. |
| A7 | Actualizar README y documentación de Gacha, y registrar un inventario de pendientes de contenido del sitio y panel. | La guía actual describe un sistema distinto del publicado. | S | Bajo: documentación desactualizada induce cambios erróneos. | Confirmar comportamiento vigente con responsables de producto. |
| A8 | Hacer una auditoría guiada de teclado, foco, contraste, mensajes y móvil en compra, Gacha, Cheki y Backstage. | Los atributos de accesibilidad en fuente no garantizan uso efectivo. | M | Medio: arreglos visuales podrían introducir regresiones. | Dispositivos, lector de pantalla y criterios de aceptación. |

**Pasos concretos para “Ahora”**

1. **A1:** reunir datos bancarios y de contacto aprobados; cerrar términos de compra, cambios y devoluciones con el responsable; revisar cada `COMPLETAR` público antes de cambiar disponibilidad de pago.
2. **A2:** abrir el incidente exacto en GitGuardian, anotar estado, tipo de clave, alcance y fechas sin copiar su valor; contrastar con PR #13 y uso real; decidir si corresponde cierre o respuesta adicional según la clasificación.
3. **A3:** inventariar tabla/bucket, política y rol autorizado; revisar intentos permitidos y denegados en un entorno aislado; decidir por separado los avisos del asesor, con respaldo y revisión antes de cualquier cambio remoto.
4. **A4:** preparar pedidos Sandbox sobre y bajo $2.000; probar canje inicial, repetido y concurrente, apertura, devolución del navegador, fallo de red y conciliación; registrar resultados y remedios sin tocar producción.
5. **A5:** registrar dimensiones, formato y tamaño de las cuatro imágenes; producir variantes adecuadas; comparar calidad y bytes reales en móvil; actualizar referencias solo después de la aprobación visual.
6. **A6:** clasificar las pruebas existentes en locales y dependientes de servicios; ejecutar las locales en pull requests y las de integración en un entorno controlado; exigir resultados estables antes de proteger la publicación.
7. **A7:** actualizar README y Gacha según el flujo vigente; marcar funciones incompletas del avatar y contenidos administrables con responsable y criterio de terminado.
8. **A8:** recorrer cada flujo con teclado y lector de pantalla, en ancho móvil y escritorio; documentar hallazgos reproducibles, corregirlos y comprobar que `prefers-reduced-motion` mantiene la información.

### Siguiente

| ID | Qué | Por qué importa | Esfuerzo | Riesgo | Dependencias |
| --- | --- | --- | :---: | --- | --- |
| S1 | Preparar PayPal Live: cuenta/aplicación aprobada, secretos Live, webhook, conversión CLP/USD, conciliación, devoluciones y monitoreo antes de activar la UI. | La configuración Sandbox y el código no equivalen a cobros productivos seguros. | L | Alto: cobros, cambio o inventario erróneos. | A1–A4, inventario físico por variante, aprobación comercial y [lista oficial de PayPal](https://developer.paypal.com/api/rest/production/). |
| S2 | Certificar Webpay e implementar el cambio explícito de integración a producción, secretos separados, retornos, estados tardíos y conciliación. | El endpoint actual es de integración y los retornos interrumpidos requieren tratamiento operativo. | L | Alto: cobros sin orden confirmada o duplicados. | A1–A4, pruebas de certificación y [proceso de Transbank](https://transbankdevelopers.com/documentacion/como_empezar). |
| S3 | Definir recuperación y soporte de Gacha para pérdida del navegador, códigos filtrados, errores de canje y disputas. | El código de pedido y el token local determinan acceso y recuperación. | M | Alto: pérdida de sobres o reclamaciones sin evidencia. | A4 y política de identidad/privacidad acordada. |
| S4 | Aplicar los hallazgos medidos de accesibilidad y rendimiento; recortar carga inicial de JS/CSS por página donde aporte mejora verificable. | La tienda y el panel cargan muchos recursos estáticos y el impacto móvil aún no se ha medido. | M | Medio: cambios de estilos o carga pueden romper interacciones. | A5, A8 y presupuestos con métricas reales. |
| S5 | Formalizar operación de pagos y pedidos: conciliación diaria, reembolsos, inventario, soporte y alertas. | El lanzamiento necesita capacidad de detectar y resolver estados inconsistentes. | M | Alto: incidencias financieras o de atención sin respuesta. | S1/S2 en Sandbox, responsables y políticas de A1. |
| S6 | Revisar permisos administrativos y separación de funciones por rol. | La autorización actual de Backstage depende del perfil administrador y merece revisión antes de crecer. | M | Medio: acceso excesivo o bloqueo del equipo. | Matriz de A3 y necesidades reales del equipo. |

### Después

| ID | Qué | Por qué importa | Esfuerzo | Riesgo | Dependencias |
| --- | --- | --- | :---: | --- | --- |
| D1 | Modularizar CSS/JS grandes y retirar duplicación solo donde las métricas y cambios repetidos lo justifiquen. | Reduce regresiones y coste de mantenimiento a largo plazo. | L | Medio: refactor amplio sin mejora perceptible. | S4, CI de A6 y línea base de rendimiento. |
| D2 | Definir ciclo de vida de imágenes y objetos de Storage: variantes, limpieza segura y límites de subida. | Evita crecimiento de almacenamiento y tamaños innecesarios. | M | Medio: borrar imágenes en uso. | Inventario de referencias y A5. |
| D3 | Mantener una matriz de compatibilidad y revisiones periódicas de documentación, accesibilidad, seguridad y recuperación operativa. | Las garantías se degradan cuando cambian contenido, proveedores y navegadores. | M | Bajo: deriva si no hay responsables. | Responsables designados y resultados de A2–A8. |

## No hacer todavía

- No activar PayPal Live, Webpay productivo ni transferencia con datos `COMPLETAR` o condiciones sin aprobar.
- No abrir políticas RLS, cambiar buckets o mover `pg_net` solo para silenciar avisos; primero comprobar usos y efectos.
- No tratar el incidente de GitGuardian como cerrado, rotar credenciales de producción o reescribir historial sin clasificar la detección y su exposición.
- No prometer mejoras de carga o accesibilidad basadas únicamente en tamaño de archivo y lectura del código; medir y recorrer los flujos.
