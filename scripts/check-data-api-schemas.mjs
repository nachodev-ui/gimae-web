import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../dist/supabase-config.js', import.meta.url), 'utf8');
const url = config.match(/url:\s*'([^']+)'/)?.[1];
const key = config.match(/publishableKey:\s*'([^']+)'/)?.[1];

if (!url || !key) {
  throw new Error('No se encontró URL o clave publicable en dist/supabase-config.js.');
}

for (const schema of ['public', 'private', 'net']) {
  const response = await fetch(`${url}/rest/v1/products?select=id&limit=0`, {
    headers: { apikey: key, 'Accept-Profile': schema },
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => ({}));
  const result = `${schema}: HTTP ${response.status}, código ${body.code ?? 'sin código'}`;
  console.log(result);

  if (schema === 'public' && !response.ok) {
    throw new Error('La Data API pública no respondió como se esperaba.');
  }
  if (schema !== 'public' && !(response.status === 406 && body.code === 'PGRST106')) {
    throw new Error(`El esquema ${schema} no fue rechazado explícitamente por la Data API.`);
  }
}
