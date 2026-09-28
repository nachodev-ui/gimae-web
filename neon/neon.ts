import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  auth: true,
  dataApi: true,
  preview: {
    buckets: {
      'gimae-products': { access: 'public_read' },
      // Los posts exclusivos requieren imágenes privadas. La función entrega
      // las imágenes de los posts públicos sin credenciales.
      'gimae-blog': { access: 'private' }
    },
    functions: { 'gimae-media': { name: 'Gimae media', source: './functions/media.mjs' } }
  }
});
