-- Migration: 0004_smtp_settings.sql
-- Adds email provider configuration: Resend (default) or custom SMTP server.

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('email_provider', 'resend'),
  ('smtp_host',      ''),
  ('smtp_port',      '587'),
  ('smtp_user',      ''),
  ('smtp_pass',      ''),
  ('smtp_from',      '');
