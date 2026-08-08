-- Rollback for 20260318_000003_auth_profile_contacts.sql

BEGIN;

-- Drop index
DROP INDEX IF EXISTS profiles_account_identifier_idx;

-- Remove columns
ALTER TABLE profiles
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS account_type,
  DROP COLUMN IF EXISTS account_identifier;

COMMIT;
