import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { evaluateCiRuns, evaluateDocsOnlyCiProvenance, canSkipInstall, compareVersions, verifiedNormalizedBytes, localBuilderArgs, assertInstaller, assertUpdaterSnapshot } = require('./local-update-win.cjs');
const { createUpdateTiming, withUpdateTiming } = require('./local-update-win-timing.cjs');
const { installLockFallback } = require('./local-update-win-locks.cjs');
const sha = 'a'.repeat(40);
const ci = (status, conclusion, headSha = sha) => ({ headSha, status, conclusion, databaseId: 42, headBranch: 'main', event: 'push', createdAt: '2026-10-05T06:00:00Z' });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('CI permits only the successful run for the exact remote SHA', () => {
  assert.equal(evaluateCiRuns(sha, [ci('completed', 'success', 'b'.repeat(40)), ci('completed', 'success')]), 42);
  for (const runs of [[], [ci('completed', 'failure')], [ci('in_progress', null)], [ci('completed', 'success', 'b'.repeat(40))], [{ ...ci('completed', 'success'), event: 'pull_request' }]]) {
    assert.throws(() => evaluateCiRuns(sha, runs), /CI|unverified/u);
  }
  assert.throws(() => evaluateCiRuns(sha, [ci('completed', 'success'), { ...ci('completed', 'failure'), createdAt: '2026-10-05T07:00:00Z' }]), /failure/u);
});

test('only a Markdown-only suffix inherits the nearest successful main CI', () => {
  const base = 'b'.repeat(40);
  const docsOnly = {
    status: 'ahead', behind_by: 0, total_commits: 1,
    files: [
      { filename: 'AGENTS.md', status: 'modified' },
      { filename: 'docs/notes/verification.md', status: 'modified' },
    ],
  };
  const tested = ci('completed', 'success', base);
  assert.deepEqual(evaluateDocsOnlyCiProvenance(sha, [tested], () => docsOnly),
    { runId: 42, testedSha: base, docsOnly: true });
  assert.throws(() => evaluateDocsOnlyCiProvenance(sha, [ci('completed', 'failure', base)], () => docsOnly), /failure/u);
  assert.throws(() => evaluateDocsOnlyCiProvenance(sha, [tested], () => ({ ...docsOnly, files: [{ filename: 'src/notes.ts', status: 'modified' }] })), /documentation-only/u);
  assert.throws(() => evaluateDocsOnlyCiProvenance(sha, [tested], () => ({ ...docsOnly, files: [{ filename: 'docs/vmark-port/UPSTREAM-LICENSE.txt', status: 'modified' }] })), /documentation-only/u);
  assert.throws(() => evaluateDocsOnlyCiProvenance(sha, [tested], () => ({ ...docsOnly, behind_by: 1 })), /ancestor/u);
  assert.throws(() => evaluateDocsOnlyCiProvenance(sha, [tested], () => ({ ...docsOnly, files: Array.from({ length: 300 }, (_, i) => ({ filename: `docs/${i}.md`, status: 'modified' })) })), /documentation-only/u);
});

test('source fast-forward refuses to continue with stale loaded updater modules', () => {
  const loaded = { updater: 'loaded-updater', timing: 'loaded-timing' };
  assert.doesNotThrow(() => assertUpdaterSnapshot(loaded, { ...loaded }));
  assert.throws(() => assertUpdaterSnapshot(loaded, { ...loaded, updater: 'new-updater' }), /rerun.*updater/u);
  assert.throws(() => assertUpdaterSnapshot(loaded, { ...loaded, timing: 'new-timing' }), /rerun.*updater/u);
  assert.throws(() => assertUpdaterSnapshot(loaded, { updater: 'loaded-updater' }), /rerun.*updater/u);
});

test('version ordering blocks downgrade and permits equal-version fast exit', () => {
  assert.equal(compareVersions('1.0.17', '1.0.10'), 1);
  assert.equal(compareVersions('1.0.17', '1.0.17'), 0);
  assert.equal(compareVersions('1.0.16', '1.0.17'), -1);
  assert.throws(() => compareVersions('1.0.x', '1.0.17'), /version/u);
});

test('equal version alone never skips packaging; matching SHA and installed hashes are required', () => {
  const installed = { exeHash: 'exe', asarHash: 'asar', runtimeHash: 'standalone' };
  const receipt = { sha, version: '1.0.17', ...installed };
  assert.equal(canSkipInstall(receipt, sha, '1.0.17', '1.0.17', installed), true);
  assert.equal(canSkipInstall({}, sha, '1.0.17', '1.0.17', installed), false);
  assert.equal(canSkipInstall(receipt, 'b'.repeat(40), '1.0.17', '1.0.17', installed), false);
  assert.equal(canSkipInstall(receipt, sha, '1.0.17', '1.0.17', { exeHash: 'different', asarHash: 'asar' }), false);
});

test('Windows patch correction changes CRLF only when pinned LF bytes match', () => {
  const expected = Buffer.from('original\nnew-line\n');
  const actual = Buffer.from('original\r\nnew-line\r\n');
  assert.deepEqual(verifiedNormalizedBytes(actual, digest(expected)), expected);
  assert.equal(verifiedNormalizedBytes(expected, digest(expected)), expected);
  assert.equal(verifiedNormalizedBytes(Buffer.from('different\r\n'), digest(expected)), null);
});

test('locked generated dependency stage copies only into vacant generated target', () => {
  const root = path.resolve('C:/safe-auris'), electron = path.join(root, 'electron');
  const build = path.join(root, 'release', 'new-build');
  const stage = path.join(electron, '.runtime-node-modules-stage-abc');
  const target = path.join(electron, 'node_modules');
  const copies = [];
  const denied = Object.assign(new Error('locked'), { code: 'EPERM' });
  const fileSystem = {
    renameSync: () => { throw denied; }, rmSync: () => {}, existsSync: () => false,
    cpSync: (...args) => copies.push(args), promises: {},
  };
  const promises = { rename: async () => {}, unlink: async () => {} };
  installLockFallback({ projectRoot: root, outputRoot: build, fileSystem, promises, log: { warn: () => {} } });
  fileSystem.renameSync(stage, target);
  assert.equal(copies.length, 1);
  assert.equal(copies[0][0], stage);
  assert.equal(copies[0][1], target);
  assert.deepEqual(copies[0][2], { recursive: true, force: false, errorOnExist: true });
  assert.throws(() => fileSystem.renameSync(path.join(root, 'users', 'notes'), target), /locked/u);
  assert.equal(copies.length, 1);
});

test('Electron staging lock falls back to copy only for this build output', async () => {
  const root = path.resolve('C:/safe-auris');
  const build = path.join(root, 'release', 'new-build');
  let attempts = 0, copies = 0;
  const denied = Object.assign(new Error('locked'), { code: 'EBUSY' });
  const fileSystem = { renameSync: () => {}, rmSync: () => {}, existsSync: () => false, cpSync: () => { copies++; } };
  const promises = { rename: async () => { attempts++; throw denied; }, unlink: async () => {} };
  installLockFallback({ projectRoot: root, outputRoot: build, fileSystem, promises, log: { warn: () => {} } });
  await promises.rename(path.join(build, 'win-unpacked.tmp'), path.join(build, 'win-unpacked'));
  assert.equal(attempts, 5);
  assert.equal(copies, 1);
  await assert.rejects(promises.rename(path.join(root, 'notes'), path.join(build, 'win-unpacked')), /locked/u);
  assert.equal(copies, 1);
});

test('timing records synchronous and asynchronous stages using a monotonic clock', async () => {
  let tick = 0;
  const messages = [], saved = [];
  const timing = createUpdateTiming({
    reportDir: 'unused', id: () => 'fixed-id', clock: () => tick,
    now: () => '2026-10-06T07:20:00.000Z',
    logger: { log: m => messages.push(m), warn: assert.fail },
    writeReport: (file, report) => saved.push({ file, report }),
  });
  assert.equal(timing.sync('source-sync', () => { tick += 50; return 'synced'; }), 'synced');
  assert.equal(await timing.async('smoke', async () => { tick += 125; return 200; }), 200);
  timing.finish('success');
  timing.finish('success');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].report.totalDurationMs, 175);
  assert.deepEqual(saved[0].report.stages.map(s => [s.name, s.status, s.durationMs]),
    [['source-sync', 'success', 50], ['smoke', 'success', 125]]);
  assert.match(messages[0], /source-sync.*start/u);
  assert.ok(messages.some(m => /smoke.*success/u.test(m)));
});

test('failed stages preserve original errors and still produce a failed report', async () => {
  const saved = [];
  const timing = createUpdateTiming({
    reportDir: 'unused', logger: { log: () => {}, warn: assert.fail },
    writeReport: (_, report) => saved.push(report),
  });
  const original = new Error('sensitive subprocess output must not enter report');
  await assert.rejects(withUpdateTiming(timing, async () => {
    timing.sync('passed', () => {});
    await timing.async('failed', async () => { throw original; });
  }), e => e === original);
  assert.equal(saved[0].status, 'failed');
  assert.equal(saved[0].failedStage, 'failed');
  assert.equal(saved[0].stages[1].errorType, 'Error');
  assert.ok(saved[0].stages.every(s => s.durationMs >= 0));
  assert.ok(!JSON.stringify(saved[0]).includes('sensitive subprocess'));
});

test('falsey thrown values still mark the stage and total report as failed', async () => {
  const saved = [];
  const timing = createUpdateTiming({ reportDir: 'unused', logger: { log: () => {}, warn: assert.fail },
    writeReport: (_, report) => saved.push(report) });
  let caught = false;
  try { await withUpdateTiming(timing, async () => timing.sync('falsey-error', () => { throw null; })); }
  catch (error) { caught = true; assert.equal(error, null); }
  assert.equal(caught, true);
  assert.equal(saved[0].status, 'failed');
  assert.equal(saved[0].stages[0].status, 'failed');
});

test('report context accepts only non-sensitive provenance fields', () => {
  const saved = [];
  const timing = createUpdateTiming({ reportDir: 'unused', logger: { log: () => {}, warn: assert.fail },
    writeReport: (_, report) => saved.push(report) });
  timing.context({ sha, version: '1.0.17', ciRunId: 42, outcome: 'already-verified',
    env: { SECRET: 'not stored' }, commandOutput: 'not stored' });
  timing.finish('success');
  assert.deepEqual(saved[0].context, { sha, version: '1.0.17', ciRunId: 42, outcome: 'already-verified' });
});

test('synchronous stage failures and report write failures do not mask the original update error', async () => {
  const warnings = [];
  const original = new Error('installation failed');
  const timing = createUpdateTiming({
    reportDir: 'unused', logger: { log: () => {}, warn: m => warnings.push(m) },
    writeReport: () => { throw new Error('disk full'); },
  });
  await assert.rejects(withUpdateTiming(timing, async () => timing.sync('install', () => { throw original; })), e => e === original);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /report.*failed/u);
});

test('report write failure does not rewrite a successfully verified installation as failure', async () => {
  const warnings = [];
  const timing = createUpdateTiming({ reportDir: 'unused', logger: { log: () => {}, warn: m => warnings.push(m) },
    writeReport: () => { throw new Error('disk full'); } });
  assert.equal(await withUpdateTiming(timing, async () => 'installed'), 'installed');
  assert.equal(warnings.length, 1);
});

test('throwing timing loggers cannot change success or replace the operation error', async () => {
  const broken = () => { throw new Error('logger broken'); };
  const opts = { reportDir: 'unused', logger: { log: broken, warn: broken },
    writeReport: () => { throw new Error('report writer broken'); } };
  const successful = createUpdateTiming(opts);
  assert.equal(await withUpdateTiming(successful, async () => successful.sync('verified', () => 'installed')), 'installed');
  const original = new Error('original installation error');
  const failed = createUpdateTiming(opts);
  await assert.rejects(withUpdateTiming(failed, async () => failed.async('install', async () => { throw original; })), e => e === original);
});

test('check-only timing never creates a report directory or file', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'auris-timing-check-'));
  try {
    const reportDir = path.join(temp, 'not-created');
    const timing = createUpdateTiming({ checkOnly: true, reportDir,
      logger: { log: () => {}, warn: assert.fail }, writeReport: () => assert.fail('check wrote a report') });
    await withUpdateTiming(timing, async () => timing.sync('github-check', () => 'checked'));
    assert.equal(fs.existsSync(reportDir), false);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('real reports use distinct files and never overwrite a pre-existing report', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'auris-timing-'));
  const warnings = [];
  const opts = { reportDir: temp, logger: { log: () => {}, warn: m => warnings.push(m) } };
  try {
    createUpdateTiming(opts).finish('success');
    createUpdateTiming(opts).finish('success');
    assert.equal(fs.readdirSync(temp).length, 2);
    const existing = path.join(temp, 'existing.json');
    fs.writeFileSync(existing, 'keep original');
    createUpdateTiming({ ...opts, id: () => 'existing' }).finish('success');
    assert.equal(fs.readFileSync(existing, 'utf8'), 'keep original');
    assert.equal(warnings.length, 1);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('monotonic timing tolerates wall-clock reversal and cannot record negative duration', () => {
  let tick = 100;
  const saved = [];
  const timing = createUpdateTiming({ reportDir: 'unused', clock: () => tick,
    now: () => tick === 100 ? '2026-10-06T07:00:00Z' : '2026-10-06T06:59:00Z',
    logger: { log: () => {}, warn: assert.fail }, writeReport: (_, r) => saved.push(r) });
  timing.sync('clock-change', () => { tick += 25; });
  timing.finish('success');
  assert.equal(saved[0].totalDurationMs, 25);
  assert.equal(saved[0].stages[0].durationMs, 25);
});

test('local packaging requests NSIS x64 only without changing release configuration', () => {
  const output = path.resolve('release/test-batch');
  assert.deepEqual(localBuilderArgs(output), ['--win', 'nsis', '--x64', '--config.npmRebuild=false', '--publish', 'never', `--config.directories.output=${output}`]);
  assert.ok(!localBuilderArgs(output).includes('zip'));
  const config = fs.readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8');
  assert.match(config, /target: nsis/u);
  assert.match(config, /target: zip/u);
});

test('local packaging still rejects missing or undersized NSIS installers', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'auris-installer-contract-'));
  const installer = path.join(temp, 'installer.exe');
  try {
    assert.throws(() => assertInstaller(installer), /NSIS installer/u);
    fs.writeFileSync(installer, 'tiny');
    assert.throws(() => assertInstaller(installer), /NSIS installer/u);
    fs.writeFileSync(installer, Buffer.alloc(1000000));
    assert.doesNotThrow(() => assertInstaller(installer));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('locked stage refuses to overwrite a target that already exists', () => {
  const root = path.resolve('C:/safe-auris'), electron = path.join(root, 'electron');
  const build = path.join(root, 'release', 'new-build');
  let copies = 0;
  const fileSystem = {
    renameSync: () => { throw Object.assign(new Error('locked'), { code: 'EPERM' }); },
    rmSync: () => {}, existsSync: () => true, cpSync: () => copies++,
  };
  const promises = { rename: async () => {}, unlink: async () => {} };
  installLockFallback({ projectRoot: root, outputRoot: build, fileSystem, promises, log: { warn: () => {} } });
  assert.throws(() => fileSystem.renameSync(path.join(electron, '.runtime-node-modules-stage-abc'), path.join(electron, 'node_modules')), /locked/u);
  assert.equal(copies, 0);
});
