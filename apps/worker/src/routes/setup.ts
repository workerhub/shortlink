import { Hono } from 'hono'
import type { Env, Variables } from '../types.js'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '0001_init',
    sql: `
CREATE TABLE users (
  id            TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email         TEXT    UNIQUE NOT NULL,
  username      TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  totp_secret   TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  totp_backup_codes TEXT,
  email_2fa_enabled INTEGER NOT NULL DEFAULT 0,
  passkey_enabled   INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE passkeys (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key    TEXT    NOT NULL,
  counter       INTEGER NOT NULL DEFAULT 0,
  name          TEXT,
  aaguid        TEXT,
  transports    TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at  INTEGER
);
CREATE INDEX idx_passkeys_user_id ON passkeys(user_id);
CREATE TABLE links (
  id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id         TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug            TEXT    UNIQUE NOT NULL,
  destination_url TEXT    NOT NULL,
  title           TEXT,
  expires_at      INTEGER,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_links_slug       ON links(slug);
CREATE INDEX idx_links_user_id    ON links(user_id);
CREATE INDEX idx_links_expires_at ON links(expires_at) WHERE expires_at IS NOT NULL;
CREATE TABLE click_logs (
  id          TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  link_id     TEXT    NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  ip_address  TEXT,
  user_agent  TEXT,
  referer     TEXT,
  country     TEXT,
  city        TEXT,
  device_type TEXT,
  browser     TEXT,
  os          TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_click_logs_link_id    ON click_logs(link_id);
CREATE INDEX idx_click_logs_created_at ON click_logs(created_at);
CREATE INDEX idx_click_logs_link_time  ON click_logs(link_id, created_at);
CREATE TABLE verifications (
  id          TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  identifier  TEXT    NOT NULL,
  type        TEXT    NOT NULL CHECK (type IN ('email_otp')),
  code_hash   TEXT    NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_verifications_identifier ON verifications(identifier, type);
CREATE TABLE settings (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO settings (key, value) VALUES ('registration_enabled', 'false'), ('app_name', 'ShortLink');
`,
  },
  {
    name: '0002_audit_log',
    sql: `
CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  admin_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  details    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_audit_logs_admin_id   ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_target_id  ON audit_logs(target_id);
`,
  },
  {
    name: '0003_totp_used',
    sql: `
CREATE TABLE totp_used (
  user_id TEXT NOT NULL,
  code    TEXT NOT NULL,
  used_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, code)
);
CREATE INDEX idx_totp_used_at ON totp_used(used_at);
CREATE TABLE IF NOT EXISTS audit_logs_backup AS SELECT * FROM audit_logs;
DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  admin_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  details    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_audit_logs_admin_id   ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_target_id  ON audit_logs(target_id);
`,
  },
  {
    name: '0004_smtp_settings',
    sql: `
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('email_provider', 'resend'),
  ('smtp_host',      ''),
  ('smtp_port',      '587'),
  ('smtp_user',      ''),
  ('smtp_pass',      ''),
  ('smtp_from',      '');
`,
  },
  {
    name: '0005_email_settings',
    sql: `
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('resend_api_key',    ''),
  ('email_from_domain', ''),
  ('email_from_name',   '');
`,
  },
  {
    name: '0006_link_seq',
    sql: `
ALTER TABLE links ADD COLUMN user_seq INTEGER NOT NULL DEFAULT 0;
UPDATE links SET user_seq = (
  SELECT COUNT(*)
  FROM links l2
  WHERE l2.user_id = links.user_id AND l2.rowid <= links.rowid
);
`,
  },
]

// D1's exec() only processes the first line of a multi-line string.
// Strip SQL line comments and collapse all whitespace to a single line.
function toSingleLine(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--')
      return idx >= 0 ? line.slice(0, idx) : line
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

app.get('/:secret', async (c) => {
  const secret = c.req.param('secret')
  if (!c.env.SETUP_SECRET || secret !== c.env.SETUP_SECRET) {
    return c.notFound()
  }

  // Use prepare().run() for single-statement DDL — avoids exec()'s newline limitation
  await c.env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS _schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()))',
  ).run()

  const { results } = await c.env.DB.prepare('SELECT name FROM _schema_migrations').all<{ name: string }>()
  const applied = new Set(results.map((r) => r.name))

  const log: { name: string; status: 'applied' | 'skipped' | 'error'; error?: string }[] = []

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) {
      log.push({ name: migration.name, status: 'skipped' })
      continue
    }
    try {
      await c.env.DB.exec(toSingleLine(migration.sql))
      await c.env.DB.prepare('INSERT INTO _schema_migrations (name) VALUES (?)').bind(migration.name).run()
      log.push({ name: migration.name, status: 'applied' })
    } catch (err) {
      log.push({ name: migration.name, status: 'error', error: String(err) })
      break
    }
  }

  return c.json({ migrations: log })
})

export default app
