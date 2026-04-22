// Short code generation with rejection sampling to avoid modulo bias
// 62^4 = 14,776,336 possible 4-char codes

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const ALPHABET_LEN = ALPHABET.length // 62
// Largest multiple of 62 that fits in a byte: floor(256/62)*62 = 4*62 = 248
const REJECTION_THRESHOLD = Math.floor(256 / ALPHABET_LEN) * ALPHABET_LEN

export function generateSlug(length = 4): string {
  const result: string[] = []
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array((length - result.length) * 2))
    for (const byte of bytes) {
      if (result.length >= length) break
      if (byte < REJECTION_THRESHOLD) {
        result.push(ALPHABET[byte % ALPHABET_LEN]!)
      }
    }
  }
  return result.join('')
}

export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{1,50}$/.test(slug)
}

// Reserved slugs that would conflict with SPA routes — also used in index.ts to
// build the SPA_PREFIXES list so both lists stay in sync (L6).
export const RESERVED_SLUGS = new Set([
  'login',
  'register',
  'dashboard',
  'admin',
  'settings',
  'api',
  'two-factor',
  'two_factor',
  'forgot-password',
  '404',
  '500',
  'setup',
])

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase())
}
