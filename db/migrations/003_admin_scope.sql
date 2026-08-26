-- 003_admin_scope.sql
-- Extend the api_keys.scope CHECK to allow 'admin', enabling admin API keys
-- for the requireScope() bypass in packages/api/src/middleware/auth.js.
-- The previous constraint only allowed ('read', 'convert').

ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_scope_check;

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_scope_check CHECK (scope IN ('read', 'convert', 'admin'));

-- Also update bootstrapDevKeys in apiKeys.js inserts with scope 'convert' — no
-- schema change needed there. Admin keys must be inserted manually or via a
-- future admin endpoint (see docs/ROADMAP.md).
