-- Rollback for 20260318_000001_initial_schema.sql
-- WARNING: This will delete all data in these tables

BEGIN;

-- Drop storage bucket
DELETE FROM storage.buckets WHERE id = 'shadowing-audio';

-- Drop indexes
DROP INDEX IF EXISTS word_tokens_sentence_id_idx;
DROP INDEX IF EXISTS sentences_session_id_idx;
DROP INDEX IF EXISTS sessions_user_id_idx;

-- Drop tables in reverse order (respecting foreign key constraints)
DROP TABLE IF EXISTS templates;
DROP TABLE IF EXISTS word_tokens;
DROP TABLE IF EXISTS sentences;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS profiles;

COMMIT;
