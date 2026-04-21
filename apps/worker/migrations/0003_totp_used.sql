-- 0003_totp_used.sql
-- C-1 (TOTP replay): Atomic one-time-use table replaces the non-atomic KV read-then-write.
-- INSERT OR IGNORE is a single SQLite operation — no TOCTOU window.
-- Rows are purged by a nightly Cron Trigger; used_at lets the handler filter by age.

CREATE TABLE totp_used (
  user_id TEXT NOT NULL,
  code    TEXT NOT NULL,
  used_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, code)
);

-- R5-L4: Index used_at so the nightly cron DELETE (WHERE used_at < unixepoch() - 90)
--         does not perform a full table scan on high-traffic deployments.
CREATE INDEX idx_totp_used_at ON totp_used(used_at);

-- M-3: Drop the old audit_logs table so we can recreate it with nullable admin_id
-- (SQLite does not support ALTER COLUMN, so we recreate the table.)
--
-- !! DATA LOSS WARNING !!
-- This migration drops all existing audit_logs rows.
-- Before applying to production, export your audit history first:
--   wrangler d1 execute shortlink --command "SELECT * FROM audit_logs" --json > audit_logs_backup.json
-- The statement below creates a local SQL backup table as a safety net:
CREATE TABLE IF NOT EXISTS audit_logs_backup AS SELECT * FROM audit_logs;
DROP TABLE IF EXISTS audit_logs;
-- R5-S2: Once you have confirmed this migration is successful in production,
--         drop the backup table to avoid permanent storage waste:
--   wrangler d1 execute shortlink --command "DROP TABLE IF EXISTS audit_logs_backup"

CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  -- M-3: ON DELETE SET NULL — deleting an admin preserves the audit trail.
  admin_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  details    TEXT,            -- JSON blob, nullable
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_audit_logs_admin_id   ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_target_id  ON audit_logs(target_id);
