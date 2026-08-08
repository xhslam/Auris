# Database Migration Strategy

## Problem Statement

The project uses a dual-backend approach:
- **Supabase (PostgreSQL)**: Cloud database for authenticated users
- **Local Files/SQLite**: Offline fallback for desktop app

This creates potential data inconsistency issues when:
1. Migrations are applied to Supabase but not reflected in local storage
2. Users work offline and create data that conflicts with cloud data
3. Schema changes break compatibility between backends

## Solution Architecture

### 1. Migration Version Control

All migrations are tracked in `supabase/migrations/` with:
- Timestamp-based versioning (`YYYYMMDD_NNNNNN`)
- Forward migration SQL
- Rollback SQL for each migration
- Migration tracking table in Supabase

### 2. Automated Migration Management

**Scripts:**
- `npm run migration:status` - Show applied/pending migrations
- `npm run migration:up` - Apply all pending migrations
- `npm run migration:down` - Rollback last migration
- `npm run migration:create -- <name>` - Create new migration

**Features:**
- Automatic rollback file generation
- Transaction-wrapped migrations
- Error recovery with detailed logging
- Idempotent migration application

### 3. Data Consistency Monitoring

**Scripts:**
- `npm run db:check` - Detect inconsistencies between local and cloud
- `npm run db:sync` - Sync local data to Supabase

**Checks:**
- Sessions existing only locally or remotely
- Timestamp mismatches indicating conflicts
- Orphaned sentences/word_tokens

### 4. SQLite Schema Sync

**Script:**
- `npm run db:sync-sqlite` - Generate SQLite schema from Supabase migrations

**Process:**
1. Parse Supabase migrations
2. Convert PostgreSQL types to SQLite equivalents
3. Generate compatible CREATE TABLE/INDEX statements
4. Output to `electron/schema.sql`

### 5. Repository Layer Abstraction

The `session-repository.ts` provides a unified interface:

```typescript
interface SessionRepositoryBackend {
  createEmptySessionRecord(input): Promise<SessionRecord>;
  deleteSessionRecord(sessionId): Promise<void>;
  savePreparedSessionArtifacts(input): Promise<SessionRecord>;
  listRecentSessionsByUser(userId): Promise<SessionRecord[]>;
  getSessionById(sessionId): Promise<SessionRecord | null>;
  getSessionArtifacts(sessionId): Promise<{sentences, wordTokens}>;
}
```

**Fallback Strategy:**
1. Try Supabase operation
2. On error, fall back to local file backend
3. Log failures for later sync

## Migration Workflow

### Development

1. Create migration:
   ```bash
   npm run migration:create -- add_user_preferences
   ```

2. Edit generated files:
   - `20260421_000001_add_user_preferences.sql`
   - `20260421_000001_add_user_preferences_rollback.sql`

3. Test locally:
   ```bash
   npm run migration:up
   ```

4. Verify:
   ```bash
   npm run migration:status
   npm run db:check
   ```

5. Sync SQLite schema:
   ```bash
   npm run db:sync-sqlite
   ```

6. Commit all files:
   - Migration SQL
   - Rollback SQL
   - Updated `electron/schema.sql`

### Production Deployment

1. Review pending migrations:
   ```bash
   npm run migration:status
   ```

2. Backup database (Supabase dashboard)

3. Apply migrations:
   ```bash
   npm run migration:up
   ```

4. Verify application health

5. If issues occur:
   ```bash
   npm run migration:down
   ```

## Conflict Resolution

### Scenario 1: User Works Offline

**Problem:** User creates sessions locally while offline. When online, cloud has different data.

**Solution:**
1. Run `npm run db:check` to identify conflicts
2. Review timestamp mismatches
3. Decide merge strategy:
   - Keep local (sync to cloud)
   - Keep remote (discard local)
   - Manual merge

### Scenario 2: Schema Migration Breaks Local Storage

**Problem:** Migration adds required column, local storage doesn't have it.

**Solution:**
1. Update `local-persistence.ts` to handle missing fields
2. Provide default values for new columns
3. Add migration logic in `readLocalSessionStore()`

### Scenario 3: Concurrent Migrations

**Problem:** Two developers create migrations with same sequence number.

**Solution:**
1. Git merge conflict on migration files
2. Renumber later migration sequentially
3. Update migration tracking table
4. Reapply migrations in correct order

## Best Practices

1. **Always write rollback SQL** - Every migration must be reversible
2. **Test migrations locally first** - Never apply untested migrations to production
3. **Use transactions** - Wrap DDL in BEGIN/COMMIT
4. **Document breaking changes** - Add comments explaining impact
5. **Sync SQLite schema** - Run `db:sync-sqlite` after every migration
6. **Check consistency regularly** - Run `db:check` before deployments
7. **Backup before migrations** - Always have a recovery plan

## Monitoring

### Health Checks

Add to CI/CD pipeline:
```bash
npm run migration:status  # Ensure all migrations applied
npm run db:check          # Detect inconsistencies
npm run test              # Run migration tests
```

### Alerts

Monitor for:
- Failed migration applications
- High inconsistency counts
- Repeated fallback to local storage
- SQLite schema drift

## Future Improvements

1. **Automatic sync daemon** - Background process to sync local→cloud
2. **Conflict resolution UI** - Let users choose merge strategy
3. **Migration dry-run** - Preview changes before applying
4. **Schema versioning** - Track schema version in local storage
5. **Incremental sync** - Only sync changed records
6. **Bidirectional sync** - Cloud→local sync for multi-device support

## References

- Supabase migrations: `supabase/migrations/`
- Repository layer: `src/server/repositories/session-repository.ts`
- Local storage: `src/server/repositories/local-persistence.ts`
- SQLite databases: `electron/*-db.cjs`
