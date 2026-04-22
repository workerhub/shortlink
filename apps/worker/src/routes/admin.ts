import { Hono } from 'hono'
import { requireAdmin } from '../middleware/auth.js'
import { deleteCachedLink, deleteCachedSetting, setCachedSetting } from '../lib/kv.js'
import type { Env, Variables, UserRow, LinkRow } from '../types.js'

const admin = new Hono<{ Bindings: Env; Variables: Variables }>()

admin.use('*', requireAdmin)

// ─── Audit log helper (L7) ────────────────────────────────────────────────────

async function auditLog(
  db: Env['DB'],
  adminId: string,
  action: string,
  targetId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO audit_logs (admin_id, action, target_id, details) VALUES (?1, ?2, ?3, ?4)',
    )
    .bind(adminId, action, targetId, details ? JSON.stringify(details) : null)
    .run()
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats
// ─────────────────────────────────────────────────────────────────────────────
admin.get('/stats', async (c) => {
  const dayAgo = Math.floor(Date.now() / 1000) - 86400

  const [users, links, clicksToday, clicksTotal] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT COUNT(*) as n FROM users'),
    c.env.DB.prepare('SELECT COUNT(*) as n FROM links'),
    c.env.DB.prepare('SELECT COUNT(*) as n FROM click_logs WHERE created_at >= ?1').bind(dayAgo),
    c.env.DB.prepare('SELECT COUNT(*) as n FROM click_logs'),
  ])

  return c.json({
    users: (users!.results[0] as { n: number }).n,
    links: (links!.results[0] as { n: number }).n,
    clicksToday: (clicksToday!.results[0] as { n: number }).n,
    clicksTotal: (clicksTotal!.results[0] as { n: number }).n,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users
// ─────────────────────────────────────────────────────────────────────────────
admin.get('/users', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)))
  const search = c.req.query('search')?.trim() ?? ''
  const offset = (page - 1) * limit

  let query: string
  let countQuery: string
  const baseBinds: (string | number)[] = []
  // LOW-6: Escape LIKE metacharacters to prevent unintended wildcard matching
  const safe = search.replace(/[%_\\]/g, '\\$&')

  if (search) {
    query = `SELECT id, email, username, role, is_active, totp_enabled, passkey_enabled, email_2fa_enabled, created_at
             FROM users WHERE email LIKE ?1 ESCAPE '\\' OR username LIKE ?1 ESCAPE '\\'
             ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`
    countQuery = `SELECT COUNT(*) as n FROM users WHERE email LIKE ?1 ESCAPE '\\' OR username LIKE ?1 ESCAPE '\\'`
    baseBinds.push(`%${safe}%`, limit, offset)
  } else {
    query = `SELECT id, email, username, role, is_active, totp_enabled, passkey_enabled, email_2fa_enabled, created_at
             FROM users ORDER BY created_at DESC LIMIT ?1 OFFSET ?2`
    countQuery = `SELECT COUNT(*) as n FROM users`
    baseBinds.push(limit, offset)
  }

  const [rows, countRow] = await c.env.DB.batch([
    c.env.DB.prepare(query).bind(...baseBinds),
    c.env.DB.prepare(countQuery).bind(...(search ? [`%${safe}%`] : [])),
  ])

  const total = (countRow!.results[0] as { n: number } | undefined)?.n ?? 0

  return c.json({
    users: rows!.results,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/users/:id
// ─────────────────────────────────────────────────────────────────────────────
admin.patch('/users/:id', async (c) => {
  const adminId = c.get('userId')
  const id = c.req.param('id')
  const body = await c.req.json<{ isActive?: boolean; role?: 'admin' | 'user' }>().catch(() => null)
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400)

  // LOW-2: Runtime validation — TypeScript types don't protect against arbitrary HTTP clients
  if (body.role !== undefined && !['admin', 'user'].includes(body.role)) {
    return c.json({ error: 'role must be "admin" or "user"' }, 400)
  }

  // L3: Prevent admin from demoting themselves
  if (id === adminId && body.role === 'user') {
    return c.json({ error: 'Cannot demote yourself' }, 400)
  }
  // R6-L3: Prevent admin from deactivating themselves (would lock them out permanently)
  if (id === adminId && body.isActive === false) {
    return c.json({ error: 'Cannot deactivate yourself' }, 400)
  }

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?1')
    .bind(id)
    .first<Pick<UserRow, 'id'>>()
  if (!user) return c.json({ error: 'User not found' }, 404)

  const sets: string[] = ['updated_at = unixepoch()']
  const vals: (string | number)[] = []

  if (body.isActive !== undefined) { sets.push(`is_active = ?${vals.push(body.isActive ? 1 : 0)}`); }
  if (body.role !== undefined) { sets.push(`role = ?${vals.push(body.role)}`); }

  if (sets.length === 1) return c.json({ error: 'Nothing to update' }, 400)

  vals.push(id)
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?${vals.length}`)
    .bind(...vals)
    .run()

  // L7: Audit log
  await auditLog(c.env.DB, adminId, 'update_user', id, { isActive: body.isActive, role: body.role })

  return c.json({ success: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:id
// ─────────────────────────────────────────────────────────────────────────────
admin.delete('/users/:id', async (c) => {
  const adminId = c.get('userId')
  const id = c.req.param('id')

  if (id === adminId) return c.json({ error: 'Cannot delete yourself' }, 400)

  // Get all slugs before cascade delete so we can purge KV
  const slugRows = await c.env.DB.prepare('SELECT slug FROM links WHERE user_id = ?1')
    .bind(id)
    .all<Pick<LinkRow, 'slug'>>()

  const result = await c.env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(id).run()
  if (result.meta.changes === 0) return c.json({ error: 'User not found' }, 404)

  // Purge KV caches
  await Promise.all(slugRows.results.map((r) => deleteCachedLink(c.env.LINKS_KV, r.slug)))

  // L7: Audit log
  await auditLog(c.env.DB, adminId, 'delete_user', id)

  return c.json({ success: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/links
// ─────────────────────────────────────────────────────────────────────────────
admin.get('/links', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)))
  const search = c.req.query('search')?.trim() ?? ''
  const userId = c.req.query('userId')
  const offset = (page - 1) * limit

  const conditions: string[] = []
  const binds: (string | number)[] = []

  if (userId) { binds.push(userId); conditions.push(`l.user_id = ?${binds.length}`) }
  if (search) {
    // LOW-6: Escape LIKE metacharacters
    const safe = search.replace(/[%_\\]/g, '\\$&')
    binds.push(`%${safe}%`)
    conditions.push(`(l.slug LIKE ?${binds.length} ESCAPE '\\' OR l.destination_url LIKE ?${binds.length} ESCAPE '\\')`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const [rows, countRow] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT l.rowid as seq, l.id, l.slug, l.destination_url, l.title, l.expires_at, l.is_active, l.created_at,
              u.email as user_email, u.username as user_username
       FROM links l JOIN users u ON l.user_id = u.id
       ${where} ORDER BY l.created_at DESC LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`,
    ).bind(...binds, limit, offset),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM links l ${where}`).bind(...binds),
  ])

  const total = (countRow!.results[0] as { n: number } | undefined)?.n ?? 0

  return c.json({
    links: rows!.results,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/settings
// ─────────────────────────────────────────────────────────────────────────────
admin.get('/settings', async (c) => {
  const rows = await c.env.DB.prepare('SELECT key, value FROM settings').all<{
    key: string
    value: string
  }>()
  const settings = Object.fromEntries(rows.results.map((r) => [r.key, r.value]))
  return c.json({ settings })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/settings
// ─────────────────────────────────────────────────────────────────────────────
admin.put('/settings', async (c) => {
  const adminId = c.get('userId')
  const body = await c.req.json<Record<string, string>>().catch(() => null)
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400)
  const allowedKeys = new Set([
    'registration_enabled',
    'app_name',
    'email_provider',
    'resend_api_key',
    'email_from_domain',
    'email_from_name',
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_pass',
    'smtp_from',
  ])

  const updates = Object.entries(body).filter(([k]) => allowedKeys.has(k))
  if (updates.length === 0) return c.json({ error: 'No valid settings keys provided' }, 400)

  // L-3 / R4-M1: Validate app_name — length, no HTML-special chars, no CR/LF (email header injection)
  const appNameEntry = updates.find(([k]) => k === 'app_name')
  if (appNameEntry) {
    const v = appNameEntry[1]
    if (typeof v !== 'string' || v.length === 0 || v.length > 64 || /[<>"'&\r\n]/.test(v)) {
      return c.json({ error: 'app_name must be 1\u201364 printable characters with no HTML or newline characters' }, 400)
    }
  }

  // Validate email_provider
  const providerEntry = updates.find(([k]) => k === 'email_provider')
  if (providerEntry && !['resend', 'smtp'].includes(providerEntry[1])) {
    return c.json({ error: 'email_provider must be "resend" or "smtp"' }, 400)
  }

  // Validate smtp_port: 1–65535
  const portEntry = updates.find(([k]) => k === 'smtp_port')
  if (portEntry) {
    const p = parseInt(portEntry[1], 10)
    if (isNaN(p) || p < 1 || p > 65535) {
      return c.json({ error: 'smtp_port must be a number between 1 and 65535' }, 400)
    }
  }

  // Validate smtp_from: must be a plausible email address (contains @ and a dot after it)
  const fromEntry = updates.find(([k]) => k === 'smtp_from')
  if (fromEntry && fromEntry[1] !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEntry[1])) {
      return c.json({ error: 'smtp_from must be a valid email address' }, 400)
    }
  }

  // Validate email_from_domain: no protocol, no path, no CR/LF
  const fromDomainEntry = updates.find(([k]) => k === 'email_from_domain')
  if (fromDomainEntry && fromDomainEntry[1] !== '') {
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(fromDomainEntry[1])) {
      return c.json({ error: 'email_from_domain must be a bare domain (e.g. example.com)' }, 400)
    }
  }

  // Prevent CR/LF in any SMTP-related field (email header injection guard)
  const smtpTextKeys = new Set(['smtp_host', 'smtp_user', 'smtp_pass', 'smtp_from', 'resend_api_key', 'email_from_domain', 'email_from_name'])
  for (const [key, value] of updates) {
    if (smtpTextKeys.has(key) && /[\r\n]/.test(value)) {
      return c.json({ error: `${key} must not contain newline characters` }, 400)
    }
  }

  await Promise.all(
    updates.map(async ([key, value]) => {
      await c.env.DB.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = unixepoch()',
      )
        .bind(key, value)
        .run()
      // Immediately invalidate KV cache for the setting
      await deleteCachedSetting(c.env.LINKS_KV, key)
    }),
  )

  // L7: Audit log
  await auditLog(c.env.DB, adminId, 'update_settings', 'settings', { updates: Object.fromEntries(updates) })

  return c.json({ success: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/links/:id
// ─────────────────────────────────────────────────────────────────────────────
admin.delete('/links/:id', async (c) => {
  const adminId = c.get('userId')
  const id = c.req.param('id')

  const existing = await c.env.DB.prepare('SELECT slug FROM links WHERE id = ?1')
    .bind(id)
    .first<Pick<LinkRow, 'slug'>>()

  if (!existing) return c.json({ error: 'Link not found' }, 404)

  await c.env.DB.prepare('DELETE FROM links WHERE id = ?1').bind(id).run()
  await deleteCachedLink(c.env.LINKS_KV, existing.slug)

  // L7: Audit log
  await auditLog(c.env.DB, adminId, 'delete_link', id, { slug: existing.slug })

  return c.json({ success: true })
})

export default admin
