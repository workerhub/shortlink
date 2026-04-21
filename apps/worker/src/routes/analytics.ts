import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import type { Env, Variables, LinkRow } from '../types.js'

const analytics = new Hono<{ Bindings: Env; Variables: Variables }>()

analytics.use('*', requireAuth)

// ─── Helper: check link ownership ────────────────────────────────────────────

async function getLinkForUser(
  db: Env['DB'],
  linkId: string,
  userId: string,
  role: string,
): Promise<LinkRow | null> {
  if (role === 'admin') {
    return db.prepare('SELECT * FROM links WHERE id = ?1').bind(linkId).first<LinkRow>()
  }
  return db
    .prepare('SELECT * FROM links WHERE id = ?1 AND user_id = ?2')
    .bind(linkId, userId)
    .first<LinkRow>()
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/:linkId
//   Query params: days=7 (default 30, max 365)
// ─────────────────────────────────────────────────────────────────────────────
analytics.get('/:linkId', async (c) => {
  const userId = c.get('userId')
  const role = c.get('userRole')
  const linkId = c.req.param('linkId')

  const link = await getLinkForUser(c.env.DB, linkId, userId, role)
  if (!link) return c.json({ error: 'Link not found' }, 404)

  const days = Math.min(365, Math.max(1, parseInt(c.req.query('days') ?? '30', 10)))
  const now = Math.floor(Date.now() / 1000)
  const since = now - days * 86400

  const [totalResult, byDayResult, byCountryResult, byDeviceResult, byBrowserResult, byOsResult, byRefResult] =
    await c.env.DB.batch([
      c.env.DB.prepare(
        'SELECT COUNT(*) as total_clicks FROM click_logs WHERE link_id = ?1 AND created_at >= ?2',
      ).bind(linkId, since),

      c.env.DB.prepare(
        `SELECT date(datetime(created_at, 'unixepoch')) as day, COUNT(*) as clicks
         FROM click_logs WHERE link_id = ?1 AND created_at >= ?2
         GROUP BY day ORDER BY day ASC`,
      ).bind(linkId, since),

      c.env.DB.prepare(
        `SELECT country, COUNT(*) as clicks FROM click_logs
         WHERE link_id = ?1 AND created_at >= ?2 AND country IS NOT NULL
         GROUP BY country ORDER BY clicks DESC LIMIT 50`,
      ).bind(linkId, since),

      c.env.DB.prepare(
        `SELECT device_type, COUNT(*) as clicks FROM click_logs
         WHERE link_id = ?1 AND created_at >= ?2 AND device_type IS NOT NULL
         GROUP BY device_type ORDER BY clicks DESC`,
      ).bind(linkId, since),

      c.env.DB.prepare(
        `SELECT browser, COUNT(*) as clicks FROM click_logs
         WHERE link_id = ?1 AND created_at >= ?2 AND browser IS NOT NULL
         GROUP BY browser ORDER BY clicks DESC LIMIT 10`,
      ).bind(linkId, since),

      c.env.DB.prepare(
        `SELECT os, COUNT(*) as clicks FROM click_logs
         WHERE link_id = ?1 AND created_at >= ?2 AND os IS NOT NULL
         GROUP BY os ORDER BY clicks DESC LIMIT 10`,
      ).bind(linkId, since),

      c.env.DB.prepare(
        `SELECT referer, COUNT(*) as clicks FROM click_logs
         WHERE link_id = ?1 AND created_at >= ?2 AND referer IS NOT NULL
         GROUP BY referer ORDER BY clicks DESC LIMIT 20`,
      ).bind(linkId, since),
    ])

  const totalClicks = (totalResult!.results[0] as { total_clicks: number } | undefined)?.total_clicks ?? 0

  return c.json({
    link: {
      id: link.id,
      slug: link.slug,
      destinationUrl: link.destination_url,
      title: link.title,
      createdAt: link.created_at,
      expiresAt: link.expires_at,
    },
    stats: {
      totalClicks,
      days,
      timeline: byDayResult!.results,
      countries: byCountryResult!.results,
      devices: byDeviceResult!.results,
      browsers: byBrowserResult!.results,
      os: byOsResult!.results,
      referrers: byRefResult!.results,
    },
  })
})

export default analytics
