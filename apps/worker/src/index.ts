import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env, Variables } from './types.js'
import authRoutes from './routes/auth.js'
import linksRoutes from './routes/links.js'
import analyticsRoutes from './routes/analytics.js'
import adminRoutes from './routes/admin.js'
import redirectHandler from './routes/redirect.js'
import setupRoutes from './routes/setup.js'
import { RESERVED_SLUGS } from './lib/slug.js'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// ─── Security headers ─────────────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  // MED-8: CSP locks down script execution and framing
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'",
  )
  // S2: HSTS for HTTPS deployments (2-year max-age, include subdomains)
  if (c.env.APP_URL.startsWith('https')) {
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }
})

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  const handler = cors({
    origin: (origin) => {
      const allowed = [c.env.APP_URL, 'http://localhost:5173', 'http://localhost:4173']
      // MED-1: Return null (not '') for disallowed origins — unambiguously suppresses header
      return allowed.includes(origin) ? origin : null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
  return handler(c, next)
})

// ─── API Routes ───────────────────────────────────────────────────────────────
app.route('/api/auth', authRoutes)
app.route('/api/links', linksRoutes)
app.route('/api/analytics', analyticsRoutes)
app.route('/api/admin', adminRoutes)

// ─── Setup / migration endpoint ───────────────────────────────────────────────
app.route('/setup', setupRoutes)

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

// ─── Short link redirect ───────────────────────────────────────────────────────
// L6: Derive SPA_PREFIXES from RESERVED_SLUGS so both lists stay in sync.
const SPA_PREFIXES = new Set([...RESERVED_SLUGS].map((s) => `/${s}`))

app.get('/:slug', async (c, next) => {
  const slug = c.req.param('slug')
  // MED-2: Exact match (not startsWith) — /:slug is single-segment, so prefix matching
  //        would incorrectly catch slugs like "logintest" or "dashboardstats".
  if (SPA_PREFIXES.has(`/${slug}`)) {
    return next()
  }
  return redirectHandler.fetch(c.req.raw, c.env, c.executionCtx)
})

// Fallback — forward all unmatched requests to Workers Assets (SPA + static files)
app.all('*', (c) => c.env.ASSETS.fetch(c.req.url) as unknown as Response)

export default {
  fetch: app.fetch,

  // L-2: Nightly cleanup of expired rows (cron: "0 3 * * *")
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await env.DB.batch([
      // Purge expired OTP verification rows
      env.DB.prepare('DELETE FROM verifications WHERE expires_at < unixepoch()'),
      // Purge TOTP one-time-use records older than the valid window (90s)
      env.DB.prepare('DELETE FROM totp_used WHERE used_at < unixepoch() - 90'),
    ])
  },
} satisfies ExportedHandler<Env>
