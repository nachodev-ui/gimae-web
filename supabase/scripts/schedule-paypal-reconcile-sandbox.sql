-- Ejecutar solo en el proyecto Sandbox hvaonobbpzbupanuymkh.
-- En otro proyecto, sustituir la URL antes de programar la tarea.
-- El comando programado nunca contiene la credencial en texto claro.
SELECT cron.schedule(
  'gimae-paypal-reconcile',
  '*/2 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://hvaonobbpzbupanuymkh.supabase.co/functions/v1/paypal-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-gimae-reconcile', (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'gimae_paypal_reconcile_token'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  )
  $job$
);
