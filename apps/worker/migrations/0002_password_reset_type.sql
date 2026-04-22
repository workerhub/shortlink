-- Expand verifications.type CHECK constraint to include 'password_reset'
-- SQLite does not support ALTER COLUMN, so we recreate the table.

CREATE TABLE verifications_new (
  id          TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  identifier  TEXT    NOT NULL,
  type        TEXT    NOT NULL CHECK (type IN ('email_otp', 'password_reset')),
  code_hash   TEXT    NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO verifications_new SELECT * FROM verifications;
DROP TABLE verifications;
ALTER TABLE verifications_new RENAME TO verifications;

CREATE INDEX idx_verifications_identifier ON verifications(identifier, type);
