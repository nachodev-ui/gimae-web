-- Permite clips cortos del equipo en la galería del blog sin obligar a usar plataformas externas.
-- En proyectos Free, 50 MB es también el máximo global configurable por archivo.
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'image/png','image/jpeg','image/webp',
      'video/mp4','video/webm','video/quicktime','video/x-m4v'
    ]
WHERE id = 'gimae-blog';
