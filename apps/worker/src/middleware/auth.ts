import type { Context, Next } from 'hono'
import { verifyAccessToken } from '../lib/jwt.js'
import { isJtiDenylisted } from '../lib/kv.js'
import type { Env, Variables } from '../types.js'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>

// LOW-1: Shared helper eliminates duplication between requireAuth and requireAdmin.
// MED-3: Denylist check happens BEFORE role check so a revoked non-admin token
//        returns 401 (not 403), preventing leaking the token's privilege level.
async function verifyTokenAndSetContext(c: AppContext): Promise<Response | null> {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = header.slice(7)
  try {
    const payload = await verifyAccessToken(token, c.env.JWT_SECRET)
    // C4 + MED-3: Denylist check before any role or state checks
    if (await isJtiDenylisted(c.env.LINKS_KV, payload.jti)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    c.set('userId', payload.sub)
    c.set('userRole', payload.role)
    c.set('userEmail', payload.email)
    c.set('userJti', payload.jti)
    c.set('userTokenExp', payload.exp)
    return null // success
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}

export const requireAuth = async (c: AppContext, next: Next) => {
  const err = await verifyTokenAndSetContext(c)
  if (err) return err
  await next()
}

export const requireAdmin = async (c: AppContext, next: Next) => {
  const err = await verifyTokenAndSetContext(c)
  if (err) return err
  if (c.get('userRole') !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
}
