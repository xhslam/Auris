/**
 * SQLite Schema Sync
 *
 * Generates SQLite-compatible schema from Supabase migrations for Electron app.
 */

const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '../supabase/migrations');
const OUTPUT_FILE = path.join(__dirname, '../electron/schema.sql');

/**
 * Convert PostgreSQL types to SQLite types
 */
function convertType(pgType) {
  const typeMap = {
    'uuid': 'TEXT',
    'text': 'TEXT',
    'timestamptz': 'TEXT',
    'integer': 'INTEGER',
    'numeric': 'REAL',
    'boolean': 'INTEGER',
  };

  const normalized = pgType.toLowerCase().trim();
  return typeMap[normalized] || 'TEXT';
}

/**
 * Parse CREATE TABLE statements from SQL
 */
function parseCreateTable(sql) {
  const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
  const tables = [];

  let match;
  while ((match = tableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const columnsBlock = match[2];

    // Skip storage and auth tables
    if (tableName.includes('storage.') || tableName.includes('auth.')) {
      continue;
    }

    // Parse columns
    const columnLines = columnsBlock
      .split(',')
      .map(line => line.trim())
      .filter(line => line && !line.toLowerCase().startsWith('constraint'));

    const columns = columnLines.map(line => {
      const parts = line.split(/\s+/);
      const name = parts[0];
      const type = convertType(parts[1]);

      // Extract constraints
      const constraints = [];
      if (line.toLowerCase().includes('primary key')) constraints.push('PRIMARY KEY');
      if (line.toLowerCase().includes('not null')) constraints.push('NOT NULL');
      if (line.toLowerCase().includes('unique')) constraints.push('UNIQUE');
      if (line.toLowerCase().includes('default')) {
        const defaultMatch = line.match(/default\s+([^,\s]+)/i);
        if (defaultMatch) {
          let defaultValue = defaultMatch[1];
          // Convert PostgreSQL defaults to SQLite
          if (defaultValue === 'now()') defaultValue = "CURRENT_TIMESTAMP";
          constraints.push(`DEFAULT ${defaultValue}`);
        }
      }

      return `${name} ${type} ${constraints.join(' ')}`.trim();
    });

    tables.push({
      name: tableName,
      columns,
      original: match[0],
    });
  }

  return tables;
}

/**
 * Parse CREATE INDEX statements
 */
function parseCreateIndex(sql) {
  const indexRegex = /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+(\w+)\s*\(([\s\S]*?)\);/gi;
  const indexes = [];

  let match;
  while ((match = indexRegex.exec(sql)) !== null) {
    const indexName = match[1];
    const tableName = match[2];
    const columns = match[3];

    // Skip storage and auth indexes
    if (tableName.includes('storage.') || tableName.includes('auth.')) {
      continue;
    }

    indexes.push({
      name: indexName,
      table: tableName,
      columns,
      original: match[0],
    });
  }

  return indexes;
}

/**
 * Generate SQLite schema
 */
function generateSqliteSchema() {
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.includes('_rollback'))
    .sort();

  let schema = `-- SQLite Schema for Electron App
-- Auto-generated from Supabase migrations
-- DO NOT EDIT MANUALLY

`;

  const allTables = [];
  const allIndexes = [];

  for (const file of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    // Skip RLS and storage policies
    if (file.includes('rls') || file.includes('storage')) {
      continue;
    }

    const tables = parseCreateTable(sql);
    const indexes = parseCreateIndex(sql);

    allTables.push(...tables);
    allIndexes.push(...indexes);
  }

  // Generate CREATE TABLE statements
  for (const table of allTables) {
    schema += `CREATE TABLE IF NOT EXISTS ${table.name} (\n`;
    schema += table.columns.map(col => `  ${col}`).join(',\n');
    schema += '\n);\n\n';
  }

  // Generate CREATE INDEX statements
  for (const index of allIndexes) {
    schema += `CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.columns});\n`;
  }

  return schema;
}

/**
 * Main
 */
function main() {
  console.log('🔄 Generating SQLite schema from Supabase migrations...\n');

  try {
    const schema = generateSqliteSchema();
    fs.writeFileSync(OUTPUT_FILE, schema);

    console.log(`✅ SQLite schema generated: ${OUTPUT_FILE}`);
    console.log(`   ${schema.split('\n').length} lines written\n`);
  } catch (error) {
    console.error('❌ Failed to generate schema:', error.message);
    process.exit(1);
  }
}

main();
