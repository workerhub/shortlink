-- Migration: 0005_email_settings.sql
-- Moves Resend API key and email sender config from Worker env vars into the
-- admin-configurable settings table. Values default to empty string; the
-- Worker falls back to legacy env vars when a setting is empty, so existing
-- deployments that still set the env vars continue to work unchanged.

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('resend_api_key',    ''),
  ('email_from_domain', ''),
  ('email_from_name',   '');
