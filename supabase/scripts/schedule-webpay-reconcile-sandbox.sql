-- Ejecutar solo en el proyecto Sandbox hvaonobbpzbupanuymkh, DESPUÉS de
-- aplicar la migración y desplegar webpay-reconcile. Reemplaza el job por nombre.
SELECT cron.schedule('gimae-webpay-reconcile','* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hvaonobbpzbupanuymkh.supabase.co/functions/v1/webpay-reconcile',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-gimae-webpay-reconcile',(
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name='gimae_webpay_reconcile_token'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  )
  $$);
