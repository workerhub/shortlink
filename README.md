# ShortLink

A self-hosted URL shortener built entirely on Cloudflare's platform. No servers to manage — runs on Workers, D1 (SQLite), and KV.

## Features

- **Short links** — random 4-char slugs or custom aliases
- **Click analytics** — country, device, browser, OS, referrer tracking via Cloudflare geo headers
- **Multi-user** — registration can be open or invite-only; first registered user becomes admin
- **Three 2FA methods** — TOTP (authenticator app), Passkey (WebAuthn), Email OTP
- **Admin panel** — manage users, view all links, configure global settings
- **Link expiry** — set expiry by date or number of days
- **Zero egress cost** — KV caches redirect lookups; click logging is non-blocking

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | TypeScript + Hono.js on Cloudflare Workers |
| Frontend | React 18 + Vite + shadcn/ui + Tailwind CSS |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Email | Resend API **or** custom SMTP server (switchable from admin UI) |
| Charts | Recharts + react-simple-maps |
| 2FA | otpauth (TOTP) + @simplewebauthn/server (Passkey) + Email OTP |

## Deployment

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- Node.js ≥ 20 and pnpm ≥ 9

### 1. Clone and install

```bash
git clone <repo>
cd shortlink
pnpm install
```

### 2. Create Cloudflare resources

```bash
# Create D1 database
wrangler d1 create shortlink

# Create KV namespace
wrangler kv namespace create LINKS_KV
```

Note the IDs printed by each command — you will add them as GitHub Actions secrets in the next step.

### 3. Add GitHub Actions secrets

In your GitHub repository go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token created with the **Edit Cloudflare Workers** template |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID (visible in the Cloudflare dashboard URL) |
| `D1_DATABASE_ID` | ID returned by `wrangler d1 create` |
| `KV_NAMESPACE_ID` | ID returned by `wrangler kv namespace create` |

The deploy workflow (`.github/workflows/deploy.yml`) injects these IDs into `wrangler.toml` at deploy time via `sed`, so no IDs are ever committed to the repository.

### 3. Configure variables and secrets

Go to [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages → shortlink → Settings → Variables and Secrets** and add:

| Name | Type | Required | Example / Notes |
|---|---|---|---|
| `APP_URL` | Variable | Yes | `https://yourdomain.com` |
| `APP_NAME` | Variable | Yes | `ShortLink` — default app name, overridable in admin UI |
| `RP_ID` | Variable | Yes | `yourdomain.com` — WebAuthn relying party ID (domain only) |
| `APP_ORIGIN` | Variable | Yes | `https://yourdomain.com` — WebAuthn origin (full URL) |
| `JWT_SECRET` | Secret | Yes | Any random string ≥ 32 chars |
| `TOTP_ENCRYPTION_KEY` | Secret | Yes | `openssl rand -hex 32` |
| `SETUP_SECRET` | Secret | Yes | `openssl rand -hex 24` — used to trigger migrations |

> `keep_vars = true` is set in `wrangler.toml`, so deployments will never overwrite these values.
>
> Email provider settings (Resend API key, SMTP credentials, etc.) are configured in the **admin UI** after first login — no Cloudflare dashboard config needed.

### 4. Run database migrations

After deploying, visit this URL once in your browser (or with `curl`):

```
https://your-worker.workers.dev/setup/<SETUP_SECRET>
```

Response on success:
```json
{
  "migrations": [
    { "name": "0001_init", "status": "applied" },
    { "name": "0002_audit_log", "status": "applied" },
    { "name": "0003_totp_used", "status": "applied" },
    { "name": "0004_smtp_settings", "status": "applied" }
  ]
}
```

Re-visiting is safe — already-applied migrations return `"skipped"`. Run it again after future migrations are added.

### 5. Build and deploy

```bash
# From the repo root
pnpm deploy
```

This builds the frontend, then deploys the Worker with the SPA bundled as static assets.

### 6. First login

Navigate to your deployed URL and register — the first account is automatically granted admin role, regardless of the `registration_enabled` setting. Then go to **Admin → Settings** to configure your email provider.

---

## Local Development

```bash
# 1. Create apps/worker/.dev.vars
cat > apps/worker/.dev.vars << 'EOF'
JWT_SECRET=dev-secret-at-least-32-characters-long
TOTP_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
RESEND_API_KEY=re_test_xxxxxxxxxxxx
SETUP_SECRET=local-setup-secret
EOF

# 2. Apply migrations to local D1
cd apps/worker && pnpm db:migrate:local && cd ../..

# 3. Start everything
pnpm dev
# Worker: http://localhost:8787
# Web:    http://localhost:5173
```

The Vite dev server proxies `/api` requests to `:8787` automatically.

---

## API Reference

### Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new account |
| POST | `/api/auth/login` | Login; returns tokens or 2FA challenge |
| POST | `/api/auth/logout` | Revoke refresh token |
| POST | `/api/auth/refresh` | Refresh access token |

### 2FA — Verification (requires `pendingToken` from login)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/2fa/totp/verify` | Complete login with TOTP code |
| POST | `/api/auth/2fa/email-otp/send` | Send email OTP |
| POST | `/api/auth/2fa/email-otp/verify` | Complete login with email OTP |
| POST | `/api/auth/2fa/passkey/verify-options` | Get WebAuthn assertion options |
| POST | `/api/auth/2fa/passkey/verify` | Complete login with passkey |

### 2FA — Setup (requires active session)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/2fa/totp/setup` | Get TOTP secret + QR URI |
| POST | `/api/auth/2fa/totp/confirm` | Confirm and enable TOTP |
| DELETE | `/api/auth/2fa/totp/disable` | Disable TOTP |
| POST | `/api/auth/2fa/passkey/register-options` | Get WebAuthn registration options |
| POST | `/api/auth/2fa/passkey/register-verify` | Register passkey |
| DELETE | `/api/auth/2fa/passkey/:id` | Remove passkey |

### Links (requires authentication)

| Method | Path | Description |
|---|---|---|
| GET | `/api/links` | List your links (paginated, searchable) |
| POST | `/api/links` | Create link |
| GET | `/api/links/:id` | Get link details |
| PUT | `/api/links/:id` | Update link |
| DELETE | `/api/links/:id` | Delete link |
| GET | `/api/links/:id/analytics` | Click analytics |

### Admin (requires admin role)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard stats |
| GET | `/api/admin/users` | List all users |
| PATCH | `/api/admin/users/:id` | Update user role/status |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/links` | List all links |
| DELETE | `/api/admin/links/:id` | Delete any link |
| GET | `/api/admin/settings` | Get global settings |
| PUT | `/api/admin/settings` | Update global settings |

### Redirect

```
GET /:slug  →  302 to destination URL
```

---

## Environment Variables

All variables and secrets are managed in the **Cloudflare dashboard** (Workers & Pages → shortlink-worker → Settings → Variables and Secrets). `keep_vars = true` in `wrangler.toml` ensures deployments never overwrite them.

| Variable | Type | Required | Description |
|---|---|---|---|
| `APP_URL` | Var | Yes | Canonical base URL (e.g. `https://go.example.com`) |
| `APP_NAME` | Var | Yes | Default app name; overridable in admin UI |
| `RP_ID` | Var | Yes | WebAuthn relying party ID (domain without protocol) |
| `APP_ORIGIN` | Var | Yes | WebAuthn origin (full URL) |
| `JWT_SECRET` | Secret | Yes | HS256 signing key, ≥ 32 chars |
| `TOTP_ENCRYPTION_KEY` | Secret | Yes | Hex string from `openssl rand -hex 32` |
| `SETUP_SECRET` | Secret | Yes | Secret path for triggering DB migrations via HTTP |

---

## Settings (Admin Panel)

| Key | Values | Description |
|---|---|---|
| `registration_enabled` | `true` / `false` | Allow new user registration (default: `false`) |
| `app_name` | string | Override displayed app name |
| `email_provider` | `resend` / `smtp` | Which email backend to use (default: `resend`) |
| `resend_api_key` | string | Resend API key (overrides `RESEND_API_KEY` env var) |
| `email_from_domain` | domain | Sender domain for Resend, e.g. `example.com` (overrides env var) |
| `email_from_name` | string | Sender display name for Resend (overrides env var) |
| `smtp_host` | hostname | SMTP server hostname |
| `smtp_port` | `587` / `465` / … | SMTP port — 465 for implicit TLS, 587 for STARTTLS |
| `smtp_from` | email address | Sender address, e.g. `noreply@example.com` |
| `smtp_user` | string | SMTP username (leave blank for unauthenticated relay) |
| `smtp_pass` | string | SMTP password (stored in D1) |

---

## License

MIT
