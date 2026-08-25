-- Edge Functions use the service_role to read/write refresh tokens. The browser
-- has no grant on this schema or table, so tokens are never exposed via the API.
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.google_calendar_connections TO service_role;
