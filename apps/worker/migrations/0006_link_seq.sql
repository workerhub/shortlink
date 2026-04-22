-- Migration: 0006_link_seq.sql
-- Adds a stable per-user sequence number to links.
-- user_seq is assigned at INSERT time and never changes, even after other links are deleted.

ALTER TABLE links ADD COLUMN user_seq INTEGER NOT NULL DEFAULT 0;

-- Backfill: assign sequence numbers based on rowid order (insertion order) within each user
UPDATE links SET user_seq = (
  SELECT COUNT(*)
  FROM links l2
  WHERE l2.user_id = links.user_id AND l2.rowid <= links.rowid
);
