# AGENTS.md

## Security rules for ChatGPT and coding agents

These rules apply to every change in this repository.

- Never hardcode passwords, API keys, private tokens, webhook secrets, signing keys, Supabase secret/service-role keys, PayPal client secrets, Banco Central tokens, or Transbank API keys.
- This also applies to shared Sandbox/integration credentials when they look like real secrets. Store them in environment variables or the platform secret manager instead of source code.
- Browser-safe public identifiers are allowed only when the provider explicitly documents them as public (for example the Supabase publishable key in `dist/supabase-config.js`). Keep a comment explaining why they are public.
- Webpay integration credentials must come from `WEBPAY_INTEGRATION_COMMERCE_CODE` and `WEBPAY_INTEGRATION_API_KEY` in Supabase Secrets. Never replace those lookups with literals.
- Do not paste secret values into commits, pull requests, issues, documentation, test fixtures, logs, or chat-generated code. Use placeholders such as `<secret>`.
- Before committing or pushing a security-sensitive change, inspect the diff and run `node scripts/check-secrets.mjs`.
- If a scanner reports a credential, first classify it as production, test/public, or false positive. Do not rotate production credentials or rewrite Git history blindly; investigate usage and exposure first.
