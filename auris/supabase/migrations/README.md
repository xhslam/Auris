# Database Migration Management

## Overview

This directory contains all Supabase database migrations for the English Shadowing project. Migrations are versioned and applied sequentially to ensure database schema consistency across environments.

## Migration Naming Convention

```
YYYYMMDD_NNNNNN_description.sql
```

- `YYYYMMDD`: Date of creation (e.g., 20260318)
- `NNNNNN`: Sequential number starting from 000001
- `description`: Brief description in snake_case

## Current Migrations

1. `20260318_000001_initial_schema.sql` - Core tables (profiles, sessions, sentences, word_tokens, templates)
2. `20260318_000002_rls_and_storage_policies.sql` - Row Level Security and Storage policies
3. `20260318_000003_auth_profile_contacts.sql` - Auth profile extensions

## Migration Workflow

### Creating a New Migration

```bash
npm run migration:create -- <description>
```

This will generate a new migration file with the correct timestamp and sequence number.

### Applying Migrations

**Development:**
```bash
npm run migration:up
```

**Production:**
```bash
npm run migration:up:prod
```

### Rolling Back Migrations

```bash
npm run migration:down
```

Rolls back the last applied migration.

### Checking Migration Status

```bash
npm run migration:status
```

Shows which migrations have been applied and which are pending.

## Migration Best Practices

1. **Always test migrations locally first** before applying to production
2. **Write rollback SQL** for every migration in a corresponding `_rollback.sql` file
3. **Never modify existing migrations** - create a new migration instead
4. **Use transactions** - wrap DDL statements in `BEGIN; ... COMMIT;`
5. **Add indexes** for foreign keys and frequently queried columns
6. **Document breaking changes** in the migration file header

## Rollback Files

Each migration should have a corresponding rollback file:

```
20260318_000001_initial_schema.sql
20260318_000001_initial_schema_rollback.sql
```

## Migration State Tracking

Migrations are tracked in the `supabase_migrations` table:

```sql
CREATE TABLE IF NOT EXISTS supabase_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Conflict Resolution

If multiple developers create migrations with the same sequence number:

1. The first merged migration keeps its number
2. Subsequent migrations are renumbered sequentially
3. Update the migration tracking table accordingly

## Emergency Rollback Procedure

If a migration causes issues in production:

1. Identify the problematic migration version
2. Run the corresponding rollback script
3. Update the migration tracking table
4. Fix the migration locally
5. Create a new migration with the fix
6. Test thoroughly before redeploying

## Local vs Cloud Sync

The project uses a dual-backend strategy:

- **Supabase (Cloud)**: Primary backend for authenticated users
- **Local Files**: Fallback for offline mode or when Supabase is unavailable

### Sync Strategy

- Writes attempt Supabase first, fall back to local on failure
- Reads attempt Supabase first, fall back to local on failure
- No automatic sync between local and cloud (user must manually export/import)

### Data Consistency

To prevent data inconsistency:

1. Always use the repository layer (`session-repository.ts`)
2. Never directly access Supabase or local storage
3. Handle errors gracefully with fallback logic
4. Log sync failures for debugging

## SQLite Schema Sync

Desktop Electron app uses SQLite for local state. To keep schemas in sync:

```bash
npm run sync:sqlite-schema
```

This generates SQLite-compatible schema from Supabase migrations.

## Testing Migrations

```bash
npm run test:migrations
```

Runs migration tests:
- Apply all migrations
- Verify schema integrity
- Test rollback procedures
- Check data integrity constraints
