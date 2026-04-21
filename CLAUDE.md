# ShortLink — Claude Code Guide

## Project Overview

ShortLink is a URL shortener running entirely on Cloudflare's platform. It is a pnpm monorepo managed with Turborepo:

- **`apps/worker`** — Cloudflare Worker (Hono.js + TypeScript backend + static asset serving)
- **`apps/web`** — React + Vite SPA (built output is served via Workers Assets)

The Worker serves both the API (`/api/*`) and the compiled frontend, so there is only one deployment unit.

---

## Commands

### Root (run from `/`)
```bash
pnpm dev          # turbo: runs both worker dev + web dev concurrently
pnpm build        # turbo: typecheck + build web
pnpm typecheck    # turbo: tsc --noEmit on both packages
pnpm deploy       # turbo: builds web then deploys worker
```

### Worker only (`apps/worker/`)
```bash
pnpm dev                  # wrangler dev (local mode)
pnpm build                # tsc --noEmit
pnpm deploy               # wrangler deploy
pnpm db:migrate:local     # apply D1 migrations locally
pnpm db:migrate           # apply D1 migrations to production
```

### Web only (`apps/web/`)
```bash
pnpm dev      # vite dev server (port 5173, proxies /api → :8787)
pnpm build    # tsc + vite build (output: apps/web/dist/)
```

---

## Local Development Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Create Cloudflare resources** (one-time)
   ```bash
   wrangler d1 create shortlink
   wrangler kv namespace create LINKS_KV
   ```
   Update `apps/worker/wrangler.toml` with the returned IDs.

3. **Apply migrations locally**
   ```bash
   cd apps/worker
   pnpm db:migrate:local
   ```

4. **Set secrets** (dev environment uses local .dev.vars or wrangler secret)
   ```bash
   # Create apps/worker/.dev.vars for local development:
   JWT_SECRET=your-random-string-32-chars-min
   TOTP_ENCRYPTION_KEY=<output of: openssl rand -hex 32>
   RESEND_API_KEY=re_xxxxxxxxxxxx
   ```

5. **Start both apps**
   ```bash
   pnpm dev
   # Worker: http://localhost:8787
   # Web:    http://localhost:5173 (proxies /api to :8787)
   ```

---

## Project Structure

```
go-cloudflare/
├── apps/
│   ├── worker/
│   │   ├── src/
│   │   │   ├── index.ts          # App entry: mounts routes, security headers, CORS, cron handler
│   │   │   ├── types.ts          # Env, Variables, LinkRow, UserRow, CachedLink types
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts       # All auth: register, login, logout, refresh, 2FA setup+verify
│   │   │   │   ├── links.ts      # Link CRUD (user-scoped)
│   │   │   │   ├── analytics.ts  # Per-link click analytics (D1 batch queries)
│   │   │   │   ├── admin.ts      # Admin: user mgmt, link mgmt, settings
│   │   │   │   └── redirect.ts   # /:slug redirect + async click logging
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts       # requireAuth and requireAdmin middleware (JWT verification)
│   │   │   └── lib/
│   │   │       ├── crypto.ts     # PBKDF2 password hash/verify; AES-256-GCM encrypt/decrypt TOTP
│   │   │       ├── jwt.ts        # issueTokenPair, verifyAccessToken, verifyRefreshToken
│   │   │       ├── slug.ts       # generateSlug (rejection-sampling), isValidSlug, isReservedSlug, RESERVED_SLUGS
│   │   │       ├── totp.ts       # TOTP generate/verify with otpauth library
│   │   │       ├── webauthn.ts   # WebAuthn helpers wrapping @simplewebauthn/server
│   │   │       ├── email.ts      # Provider dispatch: Resend API or SMTP (reads email_provider setting)
│   │   │       ├── smtp.ts       # SMTP client over cloudflare:sockets (STARTTLS + implicit TLS)
│   │   │       ├── kv.ts         # All KV operations (link cache, challenge store, rate limiting)
│   │   │       └── ua.ts         # User-agent parsing (device/browser/OS detection)
│   │   ├── migrations/
│   │   │   ├── 0001_init.sql     # Core schema: users, passkeys, links, click_logs, verifications, settings
│   │   │   ├── 0002_audit_log.sql # audit_logs table
│   │   │   ├── 0003_totp_used.sql # totp_used table (TOTP replay prevention); recreates audit_logs with nullable admin_id
│   │   │   ├── 0004_smtp_settings.sql # email_provider + SMTP config rows
│   │   │   └── 0005_email_settings.sql # resend_api_key, email_from_domain, email_from_name rows
│   │   └── wrangler.toml
│   └── web/
│       └── src/
│           ├── router.tsx
│           ├── contexts/
│           │   └── AuthContext.tsx  # BroadcastChannel cross-tab auth sync
│           ├── api/
│           │   └── client.ts        # fetch wrapper with in-flight refresh dedup
│           └── pages/
│               ├── auth/            # Login, Register, TwoFactor pages
│               ├── dashboard/       # Links list, Analytics, Account Settings
│               └── admin/           # Users, Links overview, Global Settings
```

---

## Architecture Decisions

### Single Deployment Unit
The Worker serves both API and SPA. `wrangler.toml` sets `[assets] directory = "../web/dist"` with `not_found_handling = "single-page-application"`. Hono handles `/api/*` and `/:slug` (short links); everything else falls through to the static SPA.

SPA routes (login, dashboard, etc.) are protected from being caught as short-link slugs via the `RESERVED_SLUGS` set in `lib/slug.ts`. This is the single source of truth — `index.ts` derives `SPA_PREFIXES` from it directly.

### JWT Authentication
- Access token: 15-minute lifetime, HS256, stored in memory only
- Refresh token: 7-day lifetime, stored in HttpOnly cookie
- Pending 2FA token: 10-minute lifetime, JTI stored in KV; invalidated after use
- Algorithm pinned to `HS256` at verification (prevents `alg: none` attacks)
- Refresh tokens have server-side JTI denylist in KV

### Password Hashing
PBKDF2-SHA256 via WebCrypto (Workers has no bcrypt). 100,000 iterations. Format: `v1:{base64-salt}:{base64-hash}`. The `v1:` prefix allows iterating to higher work factors in the future.

### TOTP Secret Storage
Stored AES-256-GCM encrypted in D1. The encryption key (`TOTP_ENCRYPTION_KEY`) is a hex string set via `wrangler secret put`. CryptoKey objects are cached in-memory per `(keyHex, usage)` pair to avoid re-importing on every request.

### TOTP Replay Prevention
`totp_used(user_id, code PK, used_at)` table in D1. `INSERT OR IGNORE` is atomic — no TOCTOU window. A nightly cron (`0 3 * * *`) purges rows older than 90 seconds. The same cron purges expired `verifications` rows.

### KV Key Namespace

| Prefix | Purpose | TTL |
|---|---|---|
| `link:{slug}` | Short link cache | 3600s |
| `passkey_challenge:{id}` | WebAuthn challenge | 300s |
| `otp_rate:{email}` | Email OTP rate limit | 3600s |
| `2fa_attempts:{jti}` | General 2FA attempt counter | 600s |
| `passkey_opts:{jti}` | Passkey options attempt counter | 600s |
| `totp_confirm:{userId}` | TOTP setup confirm attempt counter | 120s |
| `pending_2fa:{jti}` | Pending 2FA token payload | 600s |
| `refresh_jti:{jti}` | Refresh token denylist | 7d |
| `setting:{key}` | Settings cache (all keys incl. SMTP) | 60s |

### Redirect Flow (Critical Path)
```
GET /:slug
  1. KV.get("link:{slug}")          — fast path
  2. D1 query if KV miss             — populates KV on hit
  3. Validate is_active + expires_at
  4. waitUntil(INSERT INTO click_logs) — non-blocking, failure swallowed
  5. 302 → destination_url
     Referrer-Policy: no-referrer    — prevents slug leakage to destination
```

### Cross-Tab Auth Sync
`AuthContext.tsx` opens a `BroadcastChannel('auth')` on mount. After login or token refresh, the new access token is broadcast to other tabs so they don't trigger redundant refresh requests.

---

## Secrets Reference

| Secret | How to generate | Set via |
|---|---|---|
| `JWT_SECRET` | Any random string ≥ 32 chars | Cloudflare dashboard or `wrangler secret put JWT_SECRET` |
| `TOTP_ENCRYPTION_KEY` | `openssl rand -hex 32` | Cloudflare dashboard or `wrangler secret put TOTP_ENCRYPTION_KEY` |
| `SETUP_SECRET` | `openssl rand -hex 24` | Cloudflare dashboard or `wrangler secret put SETUP_SECRET` |

Email provider credentials (`resend_api_key`, SMTP settings) are configured in the **admin UI** — not as Worker secrets.

For local development, put secrets in `apps/worker/.dev.vars` (gitignored).

---

## wrangler.toml Variables

All set via the Cloudflare dashboard (Variables and Secrets). `keep_vars = true` prevents deployments from overwriting them.

| Var | Description |
|---|---|
| `APP_URL` | Canonical origin (`https://yourdomain.com`) |
| `APP_NAME` | Default app name (overridable in admin UI) |
| `RP_ID` | WebAuthn relying party ID (domain only, no protocol) |
| `APP_ORIGIN` | WebAuthn origin (full URL with protocol) |

Email sender config and API keys are managed in the **admin UI settings**, not here.

---

## Database Migrations

Migrations are in `apps/worker/migrations/` and applied in order by `wrangler d1 migrations apply`.

- `0001_init.sql` — all core tables
- `0002_audit_log.sql` — audit_logs table
- `0003_totp_used.sql` — totp_used table + **recreates audit_logs with nullable `admin_id`** (DATA LOSS: exports backup table first, see file comments)
- `0004_smtp_settings.sql` — adds `email_provider`, `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from` settings rows
- `0005_email_settings.sql` — adds `resend_api_key`, `email_from_domain`, `email_from_name` rows; these three env vars are now optional (admin UI takes priority)

**Before applying 0003 to production**, export existing audit_logs:
```bash
wrangler d1 execute shortlink --command "SELECT * FROM audit_logs" --json > audit_logs_backup.json
```

---

## Security Notes

- All routes check `is_active` on the user before completing authentication
- 2FA method bypass prevented: email-otp endpoints gate on `email_2fa_enabled`; TOTP on `totp_enabled`
- Passkey registration capped at 10 per user
- `cf-connecting-ip` used for IP logging (cannot be forged); `x-forwarded-for` ignored
- User-Agent and Referer headers truncated before storage (512 and 2048 bytes respectively)
- `app_name` setting validated: 1–64 chars, no HTML-special or CR/LF characters
- LIKE queries escape `%`, `_`, `\` metacharacters
- `expiresAt` validated with `Number.isSafeInteger()` to reject NaN/Infinity
- SMTP settings (`smtp_host`, `smtp_user`, `smtp_pass`, `smtp_from`) are validated against CR/LF injection; `smtp_from` validated as a valid email address; `smtp_port` validated as integer 1–65535
- SMTP passwords are stored in plain text in D1 — for production deployments where this is a concern, use Resend with a Worker secret instead

---

## Email Provider Architecture

Two providers are supported, switchable via the `email_provider` setting in the admin UI:

### Resend (default)
- Provider: `resend`
- Configured via `RESEND_API_KEY` Worker secret and `EMAIL_FROM_NAME` / `EMAIL_FROM_DOMAIN` wrangler.toml vars
- No database changes required

### Custom SMTP
- Provider: `smtp`
- All settings stored in the `settings` DB table (cached in KV for 60s)
- SMTP client implemented in `src/lib/smtp.ts` using `cloudflare:sockets` TCP API
- Supports implicit TLS (port 465) and STARTTLS (port 587 or others)
- AUTH LOGIN authentication; unauthenticated relay also supported (leave user/pass empty)
- HTML body encoded as base64 (RFC 2045, 76-char line wrap) — no 8BITMIME negotiation needed
