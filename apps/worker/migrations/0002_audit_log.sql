-- 0002_audit_log.sql

CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  -- MED-7: ON DELETE CASCADE — deleting an admin user also removes their audit entries
  -- rather than leaving orphaned rows or blocking the delete with RESTRICT (the default).
  admin_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  details    TEXT,            -- JSON blob, nullable
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_audit_logs_admin_id   ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
-- LOW-7: Index for queries like "all actions taken against user X"
CREATE INDEX idx_audit_logs_target_id  ON audit_logs(target_id);
