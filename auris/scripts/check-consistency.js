/**
 * Data Consistency Monitor
 *
 * Detects and reports inconsistencies between Supabase and local storage.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const LOCAL_STORE_PATH = path.join(__dirname, '../.shadowing-data/sessions.json');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Read local session store
 */
function readLocalStore() {
  if (!fs.existsSync(LOCAL_STORE_PATH)) {
    return { sessions: [], sentences: [], wordTokens: [] };
  }

  try {
    const content = fs.readFileSync(LOCAL_STORE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('❌ Failed to read local store:', error.message);
    return { sessions: [], sentences: [], wordTokens: [] };
  }
}

/**
 * Fetch all sessions from Supabase
 */
async function fetchSupabaseSessions(supabase) {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, user_id, title, status, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('❌ Failed to fetch Supabase sessions:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Compare local and remote data
 */
async function checkConsistency() {
  if (!supabaseUrl || !supabaseKey) {
    console.log('⚠️  Supabase credentials not configured, skipping consistency check');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const localStore = readLocalStore();
  const remoteSessions = await fetchSupabaseSessions(supabase);

  console.log('\n📊 Data Consistency Report\n');
  console.log(`Local sessions:  ${localStore.sessions.length}`);
  console.log(`Remote sessions: ${remoteSessions.length}`);

  // Find sessions only in local
  const remoteIds = new Set(remoteSessions.map(s => s.id));
  const localOnlySessions = localStore.sessions.filter(s => !remoteIds.has(s.id));

  if (localOnlySessions.length > 0) {
    console.log(`\n⚠️  ${localOnlySessions.length} session(s) exist only locally:`);
    localOnlySessions.slice(0, 5).forEach(s => {
      console.log(`   - ${s.id} | ${s.title} | ${s.status}`);
    });
    if (localOnlySessions.length > 5) {
      console.log(`   ... and ${localOnlySessions.length - 5} more`);
    }
  }

  // Find sessions only in remote
  const localIds = new Set(localStore.sessions.map(s => s.id));
  const remoteOnlySessions = remoteSessions.filter(s => !localIds.has(s.id));

  if (remoteOnlySessions.length > 0) {
    console.log(`\n⚠️  ${remoteOnlySessions.length} session(s) exist only remotely:`);
    remoteOnlySessions.slice(0, 5).forEach(s => {
      console.log(`   - ${s.id} | ${s.title} | ${s.status}`);
    });
    if (remoteOnlySessions.length > 5) {
      console.log(`   ... and ${remoteOnlySessions.length - 5} more`);
    }
  }

  // Check for timestamp mismatches
  const timestampMismatches = [];
  for (const localSession of localStore.sessions) {
    const remoteSession = remoteSessions.find(s => s.id === localSession.id);
    if (remoteSession && localSession.updatedAt !== remoteSession.updated_at) {
      timestampMismatches.push({
        id: localSession.id,
        title: localSession.title,
        localTime: localSession.updatedAt,
        remoteTime: remoteSession.updated_at,
      });
    }
  }

  if (timestampMismatches.length > 0) {
    console.log(`\n⚠️  ${timestampMismatches.length} session(s) have timestamp mismatches:`);
    timestampMismatches.slice(0, 5).forEach(s => {
      console.log(`   - ${s.id} | ${s.title}`);
      console.log(`     Local:  ${s.localTime}`);
      console.log(`     Remote: ${s.remoteTime}`);
    });
    if (timestampMismatches.length > 5) {
      console.log(`   ... and ${timestampMismatches.length - 5} more`);
    }
  }

  // Summary
  console.log('\n📋 Summary:');
  if (localOnlySessions.length === 0 && remoteOnlySessions.length === 0 && timestampMismatches.length === 0) {
    console.log('✅ Local and remote data are consistent');
  } else {
    console.log('⚠️  Inconsistencies detected:');
    if (localOnlySessions.length > 0) {
      console.log(`   - ${localOnlySessions.length} local-only sessions (may need sync to cloud)`);
    }
    if (remoteOnlySessions.length > 0) {
      console.log(`   - ${remoteOnlySessions.length} remote-only sessions (may need sync to local)`);
    }
    if (timestampMismatches.length > 0) {
      console.log(`   - ${timestampMismatches.length} timestamp mismatches (conflict resolution needed)`);
    }
  }

  console.log('');
}

/**
 * Sync local data to Supabase
 */
async function syncLocalToRemote() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not configured');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const localStore = readLocalStore();

  console.log(`\n📤 Syncing ${localStore.sessions.length} local sessions to Supabase...\n`);

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const session of localStore.sessions) {
    // Check if session exists remotely
    const { data: existing } = await supabase
      .from('sessions')
      .select('id, updated_at')
      .eq('id', session.id)
      .maybeSingle();

    if (existing) {
      // Skip if remote is newer
      if (existing.updated_at >= session.updatedAt) {
        skipped++;
        continue;
      }
    }

    // Upsert session
    const { error } = await supabase
      .from('sessions')
      .upsert({
        id: session.id,
        user_id: session.userId,
        source_type: session.sourceType,
        title: session.title,
        original_text: session.originalText,
        normalized_text: session.normalizedText,
        status: session.status,
        voice_id: session.voiceId,
        speed_default: session.speedDefault,
        audio_url: session.audioUrl,
        duration_ms: session.durationMs,
        created_at: session.createdAt,
        updated_at: session.updatedAt,
      });

    if (error) {
      console.error(`❌ Failed to sync session ${session.id}:`, error.message);
      failed++;
    } else {
      synced++;
    }
  }

  console.log(`\n✅ Sync complete:`);
  console.log(`   Synced:  ${synced}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed:  ${failed}\n`);
}

// CLI
const command = process.argv[2];

(async () => {
  try {
    switch (command) {
      case 'check':
        await checkConsistency();
        break;
      case 'sync':
        await syncLocalToRemote();
        break;
      default:
        console.log(`
Data Consistency Monitor

Usage:
  node scripts/check-consistency.js check   Check for inconsistencies
  node scripts/check-consistency.js sync    Sync local data to Supabase

Examples:
  node scripts/check-consistency.js check
  node scripts/check-consistency.js sync
        `);
    }
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  }
})();
