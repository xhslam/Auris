import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

describe('Database Migrations', () => {
  describe('Migration Files', () => {
    it('should have valid naming convention', () => {
      const files = require('node:fs')
        .readdirSync(MIGRATIONS_DIR)
        .filter((f: string) => f.endsWith('.sql') && !f.includes('_rollback'));

      for (const file of files) {
        // Format: YYYYMMDD_NNNNNN_description.sql
        const pattern = /^\d{8}_\d{6}_[a-z_]+\.sql$/;
        expect(file).toMatch(pattern);
      }
    });

    it('should have rollback files for each migration', () => {
      const migrations = require('node:fs')
        .readdirSync(MIGRATIONS_DIR)
        .filter((f: string) => f.endsWith('.sql') && !f.includes('_rollback'));

      for (const migration of migrations) {
        const rollbackFile = migration.replace('.sql', '_rollback.sql');
        const rollbackPath = join(MIGRATIONS_DIR, rollbackFile);
        expect(existsSync(rollbackPath)).toBe(true);
      }
    });

    it('should have sequential version numbers', () => {
      const migrations = require('node:fs')
        .readdirSync(MIGRATIONS_DIR)
        .filter((f: string) => f.endsWith('.sql') && !f.includes('_rollback'))
        .sort();

      const versions = migrations.map((f: string) => {
        const parts = f.split('_');
        return `${parts[0]}_${parts[1]}`;
      });

      // Check for duplicates
      const uniqueVersions = new Set(versions);
      expect(uniqueVersions.size).toBe(versions.length);
    });
  });

  describe('Migration Content', () => {
    it('should use transactions', () => {
      const migrations = require('node:fs')
        .readdirSync(MIGRATIONS_DIR)
        .filter((f: string) => f.endsWith('.sql') && !f.includes('_rollback'));

      for (const migration of migrations) {
        const content = readFileSync(join(MIGRATIONS_DIR, migration), 'utf-8');
        const hasBegin = content.toLowerCase().includes('begin');
        const hasCommit = content.toLowerCase().includes('commit');

        // Allow migrations without transactions if they're simple
        if (content.split('\n').length > 10) {
          expect(hasBegin || hasCommit).toBe(true);
        }
      }
    });

    it('should use IF NOT EXISTS for idempotency', () => {
      const migrations = require('node:fs')
        .readdirSync(MIGRATIONS_DIR)
        .filter((f: string) => f.endsWith('.sql') && !f.includes('_rollback'));

      for (const migration of migrations) {
        const content = readFileSync(join(MIGRATIONS_DIR, migration), 'utf-8');

        // Check CREATE TABLE statements
        const createTableMatches = content.match(/create\s+table\s+(?!if\s+not\s+exists)/gi);
        if (createTableMatches) {
          expect(createTableMatches.length).toBe(0);
        }

        // Check CREATE INDEX statements
        const createIndexMatches = content.match(/create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists)/gi);
        if (createIndexMatches) {
          expect(createIndexMatches.length).toBe(0);
        }
      }
    });

    it('should have proper foreign key constraints', () => {
      const initialSchema = readFileSync(
        join(MIGRATIONS_DIR, '20260318_000001_initial_schema.sql'),
        'utf-8'
      );

      // Check sentences references sessions
      expect(initialSchema).toContain('references sessions(id) on delete cascade');

      // Check word_tokens references sentences
      expect(initialSchema).toContain('references sentences(id) on delete cascade');
    });
  });

  describe('Rollback Files', () => {
    it('should have DROP statements in reverse order', () => {
      const rollback = readFileSync(
        join(MIGRATIONS_DIR, '20260318_000001_initial_schema_rollback.sql'),
        'utf-8'
      );

      const lines = rollback.split('\n').filter(l => l.includes('DROP'));
      const tableOrder = lines.map(l => {
        const match = l.match(/DROP TABLE.*?(\w+)/i);
        return match ? match[1] : null;
      }).filter(Boolean);

      // word_tokens should be dropped before sentences
      const wordTokensIdx = tableOrder.indexOf('word_tokens');
      const sentencesIdx = tableOrder.indexOf('sentences');
      if (wordTokensIdx !== -1 && sentencesIdx !== -1) {
        expect(wordTokensIdx).toBeLessThan(sentencesIdx);
      }

      // sentences should be dropped before sessions
      const sessionsIdx = tableOrder.indexOf('sessions');
      if (sentencesIdx !== -1 && sessionsIdx !== -1) {
        expect(sentencesIdx).toBeLessThan(sessionsIdx);
      }
    });

    it('should use IF EXISTS for safety', () => {
      const rollbacks = require('node:fs')
        .readdirSync(MIGRATIONS_DIR)
        .filter((f: string) => f.includes('_rollback.sql'));

      for (const rollback of rollbacks) {
        const content = readFileSync(join(MIGRATIONS_DIR, rollback), 'utf-8');

        // Check DROP statements have IF EXISTS
        const dropMatches = content.match(/drop\s+(table|index|function|policy)\s+(?!if\s+exists)/gi);
        if (dropMatches) {
          expect(dropMatches.length).toBe(0);
        }
      }
    });
  });

  describe('Schema Consistency', () => {
    it('should have matching table names in migrations and repository', () => {
      const repoContent = readFileSync(
        join(__dirname, '../../src/server/repositories/session-repository.ts'),
        'utf-8'
      );

      const expectedTables = ['sessions', 'sentences', 'word_tokens'];

      for (const table of expectedTables) {
        expect(repoContent).toContain(`from("${table}")`);
      }
    });

    it('should have indexes for foreign keys', () => {
      const initialSchema = readFileSync(
        join(MIGRATIONS_DIR, '20260318_000001_initial_schema.sql'),
        'utf-8'
      );

      expect(initialSchema).toContain('sessions_user_id_idx');
      expect(initialSchema).toContain('sentences_session_id_idx');
      expect(initialSchema).toContain('word_tokens_sentence_id_idx');
    });
  });
});
