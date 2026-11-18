# Security Architecture & Incident Readiness Runbook

## 1. Encryption Model (At Rest)
- **Cipher:** AES-256-GCM (`node:crypto`) with a fresh random 12-byte IV per record.
- **Key Derivation:** RFC 5869 HKDF-SHA256 with a fixed application salt (`masareefy-hkdf-salt-v2`) and per-user domain separation in `info` (`masareefy:expenses:v2:key=<ver>:user=<telegram_id>`).
- **AAD Binding:** Additional Authenticated Data binds `(keyVersion, userId, recordId, field)` to each ciphertext so records cannot be swapped across rows, fields, or users.
- **Encrypted fields:** `expenses.description` (sensitive merchant/item notes).
- **Deliberately unencrypted fields:** `amount`, `currency`, `category_id`, `expense_date`, `created_at` (required for SQL aggregations, charts, and rate limits).
- **Ephemeral media:** Voice notes and receipt images are downloaded into RAM only and discarded immediately after Gemini inference.

## 2. Where Secrets Live
Never commit secrets to git. All production secrets live exclusively in **Vercel Environment Variables** (encrypted by Vercel) and locally in `.env.local` (`chmod 600`, gitignored):

| Secret | Purpose | Separation Rule |
| :--- | :--- | :--- |
| `ENCRYPTION_KEY` | 32-byte (64 hex chars) master key for AES-256-GCM | **Must be completely separate from `TELEGRAM_BOT_TOKEN`** |
| `ENCRYPTION_KEY_VERSION` | Active key version (`k1`, `k2`, ...) | Enables zero-downtime key rotation |
| `WEBHOOK_SECRET_TOKEN` | 32-byte secret verified on every `/api/webhook` POST | Prevents forged webhook payloads |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API + Mini App `initData` HMAC | Revocable independently via `@BotFather` |
| `DATABASE_URL` | Supabase PostgreSQL (TLS enforced via `ssl: "require"`) | Pooler connection |
| `GEMINI_API_KEY` | Google AI Studio API key | Free-tier quota capped by app rate limiter |

> **Offline Backup Rule:** Store a copy of `ENCRYPTION_KEY` in an offline encrypted password manager (e.g., Bitwarden/1Password/KeePassXC). Losing the master key makes all encrypted descriptions permanently unrecoverable.

## 3. Incident Readiness & Rotation Procedures

### A. Rotating the Master Encryption Key (`k1` -> `k2`)
1. Generate a new 32-byte hex key: `openssl rand -hex 32`
2. Save an offline backup of the new key immediately.
3. In Vercel & `.env.local`:
   - Keep the old key as `ENCRYPTION_KEY_K1=<old_hex>`
   - Set `ENCRYPTION_KEY_K2=<new_hex>`
   - Set `ENCRYPTION_KEY=<new_hex>`
   - Set `ENCRYPTION_KEY_VERSION=k2`
4. Redeploy Vercel (new records encrypt with `k2`, old `k1` records still decrypt seamlessly).
5. Run the rotation script to re-encrypt all existing rows:
   ```bash
   npm run db:rotate-keys
   ```
6. Confirm `Failed=0`, test reading old & new records, then remove `ENCRYPTION_KEY_K1` from Vercel and `.env.local`.

### B. Revoking a Compromised Telegram Bot Token
1. Open `@BotFather` on Telegram → `/mybots` → select `@Masareefyy_bot` → **API Token** → **Revoke current token**.
2. Update `TELEGRAM_BOT_TOKEN` in Vercel Environment Variables and `.env.local`.
3. Redeploy Vercel.
4. Re-register the webhook with your secret token:
   ```bash
   npm run webhook:set https://masareefy-chi.vercel.app
   ```
*(Because `ENCRYPTION_KEY` is separate from `TELEGRAM_BOT_TOKEN`, revoking the bot token does NOT affect stored encrypted expenses.)*

### C. Rotating the Webhook Secret Token
1. Generate a new token: `openssl rand -hex 32`.
2. Update `WEBHOOK_SECRET_TOKEN` in Vercel and `.env.local`, and redeploy.
3. Run `npm run webhook:set https://masareefy-chi.vercel.app` so Telegram sends the new `X-Telegram-Bot-Api-Secret-Token` header.

### D. Breach Notification & Shutdown Policy
- **Breach:** Rotate affected keys/tokens immediately, inspect Vercel Runtime Logs for unauthorized access patterns (`[Auth]` / `[Webhook]` rejections), and notify users via Telegram broadcast if personal data was exposed.
- **User Deletion:** Users can permanently erase all their records at any time via `/delete_my_data`.
- **Shutdown:** If the project is retired, give users advance notice to `/export` their CSVs, then wipe the Supabase database and destroy all copies of `ENCRYPTION_KEY`.
