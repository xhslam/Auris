#!/usr/bin/env node

/**
 * Database Migration Manager
 *
 * Manages Supabase migrations with version tracking and rollback support.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const MIGRATIONS_DIR = path.join(__dirname, '../supabase/migrations');
const MIGRATION_TABLE = 'supabase_migrations';

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Ensure migration tracking table exists
 */
async function ensureMigrationTable() {
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  });

  if (error) {
    // Fallback: try direct query
    const { error: directError } = await supabase.from(MIGRATION_TABLE).select('version').limit(1);

    if (directError && directError.code === '42P01') {
      console.error('❌ Cannot create migration table. Please run this SQL manually:');
      console.error(`
        CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
          version TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      process.exit(1);
    }
  }
}

/**
 * Get all migration files
 */
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.includes('_rollback') && f !== 'README.md')
    .sort();

  return files.map(file => {
    const version = file.split('_').slice(0, 2).join('_');
    const name = file.replace('.sql', '');
    return { version, name, file };
  });
}

/**
 * Get applied migrations from database
 */
async function getAppliedMigrations() {
  const { data, error } = await supabase
    .from(MIGRATION_TABLE)
    .select('version, name, applied_at')
    .order('version', { ascending: true });

  if (error) {
    console.error('❌ Failed to fetch applied migrations:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Apply a migration
 */
async function applyMigration(migration) {
  const filePath = path.join(MIGRATIONS_DIR, migration.file);
  const sql = fs.readFileSync(filePath, 'utf-8');

  console.log(`📦 Applying migration: ${migration.name}`);

  // Execute migration SQL
  const { error: execError } = await supabase.rpc('exec_sql', { sql });

  if (execError) {
    // Fallback: try to execute via multiple statements
    console.warn('⚠️  RPC failed, trying direct execution...');

    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(s => s.trim());

    for (const statement of statements) {
      if (!statement.trim()) continue;

      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
      if (error) {
        console.error(`❌ Failed to execute statement:`, error.message);
        throw error;
      }
    }
  }

  // Record migration
  const { error: insertError } = await supabase
    .from(MIGRATION_TABLE)
    .insert({
      version: migration.version,
      name: migration.name,
    });

  if (insertError) {
    console.error('❌ Failed to record migration:', insertError.message);
    throw insertError;
  }

  console.log(`✅ Applied: ${migration.name}`);
}

/**
 * Rollback a migration
 */
async function rollbackMigration(migration) {
  const rollbackFile = migration.file.replace('.sql', '_rollback.sql');
  const filePath = path.join(MIGRATIONS_DIR, rollbackFile);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Rollback file not found: ${rollbackFile}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf-8');

  console.log(`🔄 Rolling back migration: ${migration.name}`);

  // Execute rollback SQL
  const { error: execError } = await supabase.rpc('exec_sql', { sql });

  if (execError) {
    console.error('❌ Rollback failed:', execError.message);
    throw execError;
  }

  // Remove migration record
  const { error: deleteError } = await supabase
    .from(MIGRATION_TABLE)
    .delete()
    .eq('version', migration.version);

  if (deleteError) {
    console.error('❌ Failed to remove migration record:', deleteError.message);
    throw deleteError;
  }

  console.log(`✅ Rolled back: ${migration.name}`);
}

/**
 * Show migration status
 */
async function showStatus() {
  await ensureMigrationTable();

  const allMigrations = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();
  const appliedVersions = new Set(appliedMigrations.map(m => m.version));

  console.log('\n📊 Migration Status:\n');
  console.log('Version         | Status   | Name');
  console.log('----------------|----------|----------------------------------');

  for (const migration of allMigrations) {
    const status = appliedVersions.has(migration.version) ? '✅ Applied' : '⏳ Pending';
    console.log(`${migration.version} | ${status} | ${migration.name}`);
  }

  const pendingCount = allMigrations.length - appliedMigrations.length;
  console.log(`\nTotal: ${allMigrations.length} migrations (${appliedMigrations.length} applied, ${pendingCount} pending)\n`);
}

/**
 * Apply all pending migrations
 */
async function migrateUp() {
  await ensureMigrationTable();

  const allMigrations = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();
  const appliedVersions = new Set(appliedMigrations.map(m => m.version));

  const pendingMigrations = allMigrations.filter(m => !appliedVersions.has(m.version));

  if (pendingMigrations.length === 0) {
    console.log('✅ All migrations are up to date');
    return;
  }

  console.log(`\n📦 Applying ${pendingMigrations.length} pending migration(s)...\n`);

  for (const migration of pendingMigrations) {
    try {
      await applyMigration(migration);
    } catch (error) {
      console.error(`\n❌ Migration failed: ${migration.name}`);
      console.error('Error:', error.message);
      console.error('\n⚠️  Database may be in an inconsistent state. Please review and fix manually.');
      process.exit(1);
    }
  }

  console.log('\n✅ All migrations applied successfully\n');
}

/**
 * Rollback the last migration
 */
async function migrateDown() {
  await ensureMigrationTable();

  const appliedMigrations = await getAppliedMigrations();

  if (appliedMigrations.length === 0) {
    console.log('ℹ️  No migrations to roll back');
    return;
  }

  const lastMigration = appliedMigrations[appliedMigrations.length - 1];
  const migrationFile = getMigrationFiles().find(m => m.version === lastMigration.version);

  if (!migrationFile) {
    console.error(`❌ Migration file not found for version: ${lastMigration.version}`);
    process.exit(1);
  }

  try {
    await rollbackMigration(migrationFile);
    console.log('\n✅ Rollback completed successfully\n');
  } catch (error) {
    console.error('\n❌ Rollback failed:', error.message);
    process.exit(1);
  }
}

/**
 * Create a new migration file
 */
function createMigration(description) {
  if (!description) {
    console.error('❌ Migration description is required');
    console.error('Usage: npm run migration:create -- <description>');
    process.exit(1);
  }

  const allMigrations = getMigrationFiles();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Find the highest sequence number for today
  const todayMigrations = allMigrations.filter(m => m.version.startsWith(today));
  const lastSeq = todayMigrations.length > 0
    ? parseInt(todayMigrations[todayMigrations.length - 1].version.split('_')[1])
    : 0;

  const nextSeq = String(lastSeq + 1).padStart(6, '0');
  const version = `${today}_${nextSeq}`;
  const name = description.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const filename = `${version}_${name}.sql`;
  const rollbackFilename = `${version}_${name}_rollback.sql`;

  const migrationPath = path.join(MIGRATIONS_DIR, filename);
  const rollbackPath = path.join(MIGRATIONS_DIR, rollbackFilename);

  const migrationTemplate = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

BEGIN;

-- Add your migration SQL here

COMMIT;
`;

  const rollbackTemplate = `-- Rollback for ${version}_${name}.sql

BEGIN;

-- Add your rollback SQL here

COMMIT;
`;

  fs.writeFileSync(migrationPath, migrationTemplate);
  fs.writeFileSync(rollbackPath, rollbackTemplate);

  console.log(`✅ Created migration files:`);
  console.log(`   ${filename}`);
  console.log(`   ${rollbackFilename}`);
}

// CLI
const command = process.argv[2];
const arg = process.argv[3];

(async () => {
  try {
    switch (command) {
      case 'status':
        await showStatus();
        break;
      case 'up':
        await migrateUp();
        break;
      case 'down':
        await migrateDown();
        break;
      case 'create':
        createMigration(arg);
        break;
      default:
        console.log(`
Database Migration Manager

Usage:
  node scripts/migrate.js status          Show migration status
  node scripts/migrate.js up              Apply all pending migrations
  node scripts/migrate.js down            Rollback the last migration
  node scripts/migrate.js create <name>   Create a new migration

Examples:
  node scripts/migrate.js status
  node scripts/migrate.js up
  node scripts/migrate.js create add_user_preferences
        `);
    }
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  }
})();
