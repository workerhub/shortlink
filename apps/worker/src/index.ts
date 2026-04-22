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
import { getCachedSetting, setCachedSetting } from './lib/kv.js'
import { tbl } from './lib/db.js'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// ─── Security headers ─────────────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'",
  )
  if (c.env.APP_URL.startsWith('https')) {
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }
})

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  const handler = cors({
    origin: (origin) => {
      const allowed = [c.env.APP_URL, 'http://localhost:5173', 'http://localhost:4173']
      return allowed.includes(origin) ? origin : null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
  return handler(c, next)
})

// ─── Public config endpoint ───────────────────────────────────────────────────
app.get('/api/config', async (c) => {
  const [appNameCached, regCached] = await Promise.all([
    getCachedSetting(c.env.LINKS_KV, 'app_name'),
    getCachedSetting(c.env.LINKS_KV, 'registration_enabled'),
  ])

  let appName: string
  if (appNameCached !== null) {
    appName = appNameCached
  } else {
    const row = await c.env.DB.prepare(
      `SELECT value FROM ${tbl(c.env, 'settings')} WHERE key = 'app_name'`,
    ).first<{ value: string }>()
    appName = row?.value ?? c.env.APP_NAME ?? 'ShortLink'
    if (row?.value) await setCachedSetting(c.env.LINKS_KV, 'app_name', row.value)
  }

  let registrationEnabled: boolean
  if (regCached !== null) {
    registrationEnabled = regCached === 'true'
  } else {
    const row = await c.env.DB.prepare(
      `SELECT value FROM ${tbl(c.env, 'settings')} WHERE key = 'registration_enabled'`,
    ).first<{ value: string }>()
    const val = row?.value ?? 'false'
    await setCachedSetting(c.env.LINKS_KV, 'registration_enabled', val)
    registrationEnabled = val === 'true'
  }

  return c.json({ appName, registrationEnabled })
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
const SPA_PREFIXES = new Set([...RESERVED_SLUGS].map((s) => `/${s}`))

app.get('/:slug', async (c, next) => {
  const slug = c.req.param('slug')
  if (SPA_PREFIXES.has(`/${slug}`)) {
    return next()
  }
  // Static files (e.g. logo.svg, favicon.ico) — slugs never contain dots
  if (slug.includes('.')) {
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
      env.DB.prepare(`DELETE FROM ${tbl(env, 'verifications')} WHERE expires_at < unixepoch()`),
      env.DB.prepare(`DELETE FROM ${tbl(env, 'totp_used')} WHERE used_at < unixepoch() - 90`),
    ])
  },
} satisfies ExportedHandler<Env>
