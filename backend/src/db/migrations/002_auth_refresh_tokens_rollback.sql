-- ==============================================================================
-- Migration Rollback: 002_auth_refresh_tokens_rollback
-- ==============================================================================

DROP TABLE IF EXISTS refresh_tokens CASCADE;
