import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { evaluateCiRuns, evaluateDocsOnlyCiProvenance, canSkipInstall, compareVersions, verifiedNormalizedBytes } = require('./local-update-win.cjs');
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
