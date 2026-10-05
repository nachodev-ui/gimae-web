import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => /\.(?:js|mjs|cjs|ts|tsx|jsx|json|ya?ml|toml|md|html|css|sql|sh|ps1|txt)$/i.test(file));

const rules = [
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{12,}/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  [
    "Hardcoded protected credential",
    /\b(?:PAYPAL_CLIENT_SECRET|BCCH_API_TOKEN|SUPABASE_SERVICE_ROLE_KEY|WEBPAY_(?:INTEGRATION_|LIVE_)?API_KEY)\b\s*[:=]\s*["'`](?!<)[^"'\`\n]{8,}["'`]/g,
  ],
  [
    "Hardcoded Transbank secret header",
    /["']Tbk-Api-Key-Secret["']\s*:\s*["'`][^"'\`\n]{16,}["'`]/g,
  ],
  [
    "High-entropy key/secret literal",
    /\b(?:apiKey|api_key|clientSecret|client_secret|webhookSecret|webhook_secret)\b\s*[:=]\s*["'`][A-Fa-f0-9_-]{32,}["'`]/g,
  ],
];

const findings = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [name, regex] of rules) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const line = content.slice(0, match.index).split("\n").length;
      findings.push({ file, line, name });
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
}

if (findings.length) {
  console.error("Potential secrets detected:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} — ${finding.name}`);
  }
  console.error("Move the value to environment variables or a secret manager before committing.");
  process.exit(1);
}

console.log(`Secret guard: OK (${files.length} tracked text files checked)`);
