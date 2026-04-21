import { Hono } from 'hono'
import { getCachedLink, setCachedLink } from '../lib/kv.js'
import { parseUA } from '../lib/ua.js'
import type { Env, Variables, LinkRow, CachedLink } from '../types.js'

const redirect = new Hono<{ Bindings: Env; Variables: Variables }>()

redirect.get('/:slug', async (c) => {
  const slug = c.req.param('slug')

  // ── 1. KV fast path ────────────────────────────────────────────────────────
  let linkData: CachedLink | null = await getCachedLink(c.env.LINKS_KV, slug)

  // ── 2. D1 fallback ─────────────────────────────────────────────────────────
  if (!linkData) {
    const row = await c.env.DB.prepare(
      'SELECT id, destination_url, is_active, expires_at FROM links WHERE slug = ?1 LIMIT 1',
    )
      .bind(slug)
      .first<Pick<LinkRow, 'id' | 'destination_url' | 'is_active' | 'expires_at'>>()

    if (!row) {
      return new Response(null, {
        status: 302,
        headers: { Location: c.env.APP_URL + '/404', 'Cache-Control': 'no-store' },
      })
    }

    linkData = {
      url: row.destination_url,
      linkId: row.id,
      isActive: row.is_active,
      expiresAt: row.expires_at,
    }

    // Only cache valid links
    if (row.is_active) {
      await setCachedLink(c.env.LINKS_KV, slug, linkData)
    }
  }

  // ── 3. Validate ────────────────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000)

  if (!linkData.isActive) {
    return new Response(null, {
      status: 302,
      headers: { Location: c.env.APP_URL + '/404', 'Cache-Control': 'no-store' },
    })
  }

  if (linkData.expiresAt !== null && linkData.expiresAt <= now) {
    return new Response(null, {
      status: 302,
      headers: { Location: c.env.APP_URL + '/404', 'Cache-Control': 'no-store' },
    })
  }

  // ── 4. Async click logging (non-blocking) ──────────────────────────────────
  // H6: cf-connecting-ip is always set by Cloudflare and can't be forged; drop x-forwarded-for
  const ip = c.req.header('cf-connecting-ip') ?? null
  // M5: Truncate unbounded headers before storage
  const ua = (c.req.header('user-agent') ?? '').slice(0, 512) || null
  const referer = (c.req.header('referer') ?? '').slice(0, 2048) || null
  const cf = c.req.raw.cf as Record<string, unknown> | undefined
  const country = (cf?.['country'] as string) ?? null
  const city = (cf?.['city'] as string) ?? null
  const { deviceType, browser, os } = parseUA(ua)
  const linkId = linkData.linkId

  c.executionCtx.waitUntil(
    (async () => {
      try {
        await c.env.DB.prepare(
          `INSERT INTO click_logs
             (link_id, ip_address, user_agent, referer, country, city, device_type, browser, os)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        )
          .bind(linkId, ip, ua, referer, country, city, deviceType, browser, os)
          .run()
      } catch {
        // Analytics failure must never affect redirect
      }
    })(),
  )

  // ── 5. Redirect ────────────────────────────────────────────────────────────
  return new Response(null, {
    status: 302,
    headers: {
      Location: linkData.url,
      'Cache-Control': 'no-store',
      // R6-S1: 'no-referrer' avoids leaking the short-link slug to the destination site
      'Referrer-Policy': 'no-referrer',
    },
  })
})

export default redirect
