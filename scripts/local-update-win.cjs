#!/usr/bin/env node
"use strict";

// Manually triggered, fail-closed source sync and local Windows installation.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync, spawn } = require("node:child_process");
const { setTimeout: wait } = require("node:timers/promises");

const root = path.resolve(__dirname, "..");
const release = path.join(root, "release");
const repo = "xhslam/Auris";
let appDir = path.join(process.env.LOCALAPPDATA || "", "Programs", "Auris");
let appExe = path.join(appDir, "Auris.exe");
const userData = path.join(process.env.APPDATA || "", "Auris");
function hash(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function verifiedNormalizedBytes(bytes, expected) {
  if (crypto.createHash("sha256").update(bytes).digest("hex") === expected) return bytes;
  const normalized = Buffer.from(bytes.toString("utf8").replace(/\r\n/gu, "\n"));
  return crypto.createHash("sha256").update(normalized).digest("hex") === expected ? normalized : null;
}
function compareVersions(left, right) {
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some(n => !Number.isSafeInteger(n) || n < 0)) fail("Invalid semantic version");
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}
function fail(message) { throw new Error(message); }
function run(file, args, { env = process.env, timeout = 600000, allowFailure = false } = {}) {
  const result = spawnSync(file, args, { cwd: root, env, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (result.error || (result.status !== 0 && !allowFailure)) {
    fail(`${file} ${args.slice(0, 3).join(" ")} failed (${result.status ?? result.error?.code}): ${(result.stderr || result.stdout || result.error?.message || "").slice(-2000)}`);
  }
  return result;
}
function npm(args, options) { return run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], options); }
function node(file, args = [], options) { return run(process.execPath, [path.join(root, file), ...args], options); }
function git(...args) { return run("git", args).stdout.trim(); }
function gh(...args) { return run("gh", args).stdout.trim(); }
function detectInstallDirectory() {
  // NSIS permits custom paths. The registered uninstaller, not a guessed default,
  // identifies the existing installation we must protect and update.
  const command = "$keys=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); $dirs=@(Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -match '^Auris(?:\\s|$)'} | ForEach-Object {if($_.InstallLocation){$_.InstallLocation}; if($_.UninstallString -match '^\"([^\"]+\\\\Uninstall Auris\\.exe)\"'){Split-Path $matches[1] -Parent}} | Sort-Object -Unique); ConvertTo-Json -InputObject $dirs -Compress";
  const result = run("powershell.exe", ["-NoProfile", "-Command", command]);
  const detected = JSON.parse(result.stdout.trim() || "[]");
  const locations = (Array.isArray(detected) ? detected : [detected]).filter(Boolean).map(p => path.resolve(p));
  if (locations.length !== 1 || !fs.existsSync(path.join(locations[0] || "", "Auris.exe"))) fail("Cannot uniquely locate the existing registered Auris installation; no install performed");
  return locations[0];
}
function assertIdentity({ allowDirty = false } = {}) {
  if (process.platform !== "win32") fail("This updater only supports Windows x64");
  if (process.arch !== "x64") fail("This updater requires Windows x64");
  if (path.resolve(git("rev-parse", "--show-toplevel")) !== root) fail("Run in the Auris repository root");
  if (git("branch", "--show-current") !== "main") fail("Only main may be updated");
  if (!/^https:\/\/github\.com\/xhslam\/auris(?:\.git)?\/?$/iu.test(git("remote", "get-url", "origin"))) fail("Unexpected origin; refusing to update");
  if (!allowDirty && git("status", "--porcelain", "--untracked-files=no")) fail("Tracked changes exist; preserve/commit them before updating");
  if (!process.env.LOCALAPPDATA || !process.env.APPDATA) fail("Windows application data paths unavailable");
  appDir = detectInstallDirectory();
  appExe = path.join(appDir, "Auris.exe");
}
function currentRemote() {
  const sha = gh("api", "repos/xhslam/Auris/commits/main", "--jq", ".sha");
  if (!/^[a-f0-9]{40}$/iu.test(sha)) fail("GitHub returned an invalid main SHA");
  return sha;
}
function evaluateCiRuns(sha, runs) {
  const matching = runs.filter(run => run.headSha === sha && run.event === "push" && run.headBranch === "main")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!matching.length) fail(`No main push Notes CI run for ${sha.slice(0, 8)}; do not install an unverified build`);
  const run = matching[0];
  if (run.status !== "completed" || run.conclusion !== "success") fail(`Notes CI is ${run.status}/${run.conclusion} for ${sha.slice(0, 8)} (run ${run.databaseId}); installation stopped`);
  return run.databaseId;
}
function evaluateDocsOnlyCiProvenance(sha, runs, compare) {
  const candidates = runs.filter(run => run.event === "push" && run.headBranch === "main" && /^[a-f0-9]{40}$/iu.test(run.headSha))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const run of candidates) {
    if (run.headSha === sha) return { runId: evaluateCiRuns(sha, [run]), testedSha: sha, docsOnly: false };
    const comparison = compare(run.headSha, sha);
    if (comparison.status !== "ahead" || comparison.behind_by !== 0) continue;
    // Never use an older green run to skip over a newer failed run. A suffix
    // may inherit a green CI result only when every change is documentation.
    if (run.status !== "completed" || run.conclusion !== "success") fail(`Nearest main Notes CI is ${run.status}/${run.conclusion}; installation stopped`);
    const files = comparison.files;
    if (!Number.isSafeInteger(comparison.total_commits) || comparison.total_commits < 1 || comparison.total_commits > 20 ||
      !Array.isArray(files) || files.length < 1 || files.length >= 300 ||
      !files.every(file => (file.filename === "AGENTS.md" || /^docs\/.+\.md$/iu.test(file.filename)) &&
        ["added", "modified", "removed"].includes(file.status) && !file.previous_filename)) {
      fail(`Changes since green CI ${run.headSha.slice(0, 8)} are not provably documentation-only; installation stopped`);
    }
    return { runId: run.databaseId, testedSha: run.headSha, docsOnly: true };
  }
  fail(`No verified main push Notes CI ancestor for ${sha.slice(0, 8)}`);
}
function ciForSha(sha) {
  const fields = "headSha,headBranch,event,createdAt,status,conclusion,databaseId";
  const direct = JSON.parse(gh("run", "list", "-R", repo, "--workflow", "Notes", "--commit", sha, "--limit", "30", "--json", fields));
  if (direct.some(run => run.headSha === sha && run.event === "push" && run.headBranch === "main")) {
    return { runId: evaluateCiRuns(sha, direct), testedSha: sha, docsOnly: false };
  }
  const recent = JSON.parse(gh("run", "list", "-R", repo, "--workflow", "Notes", "--branch", "main", "--limit", "30", "--json", fields));
  return evaluateDocsOnlyCiProvenance(sha, recent, (base, head) =>
    JSON.parse(gh("api", `repos/xhslam/Auris/compare/${base}...${head}`)));
}
function canSkipInstall(receipt, sha, version, installed, hashes) {
  return installed === version && receipt.sha === sha && receipt.version === version &&
    Boolean(hashes.exeHash && hashes.asarHash && hashes.runtimeHash) &&
    receipt.exeHash === hashes.exeHash && receipt.asarHash === hashes.asarHash &&
    receipt.runtimeHash === hashes.runtimeHash;
}
function currentInstallHashes() {
  const packed = path.join(appDir, "resources", "app.asar");
  const runtime = path.join(appDir, "resources", "standalone");
  const buildId = path.join(runtime, ".next", "BUILD_ID");
  const server = path.join(runtime, "server.js");
  return [appExe, packed, buildId, server].every(file => fs.existsSync(file)) ? {
    exeHash: hash(appExe), asarHash: hash(packed),
    runtimeHash: crypto.createHash("sha256").update(treeSummary(runtime, true)).digest("hex"),
  } : {};
}
function installedVersion() {
  if (!fs.existsSync(appExe)) return null;
  const result = run("powershell.exe", ["-NoProfile", "-Command", "(Get-Item -LiteralPath $env:AURIS_APP_EXE).VersionInfo.ProductVersion"], { env: { ...process.env, AURIS_APP_EXE: appExe } });
  return result.stdout.trim().replace(/\.0$/u, "");
}
function assertNotRunning() {
  const result = run("powershell.exe", ["-NoProfile", "-Command", "$p=$env:AURIS_APP_EXE; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'Auris.exe' -and $_.ExecutablePath -ieq $p }).Count"], { env: { ...process.env, AURIS_APP_EXE: appExe } });
  if (Number(result.stdout.trim()) > 0) fail("Auris is running. Save work and close it normally before installing; no process was killed");
}
function dependenciesMatchLock() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  if (!fs.existsSync(path.join(root, "node_modules", ".package-lock.json"))) return false;
  const direct = { ...lock.packages[""].dependencies, ...lock.packages[""].devDependencies };
  for (const name of Object.keys(direct)) {
    const actual = path.join(root, "node_modules", ...name.split("/"), "package.json");
    const expected = lock.packages[`node_modules/${name}`]?.version;
    if (!expected || !fs.existsSync(actual) || JSON.parse(fs.readFileSync(actual, "utf8")).version !== expected) return false;
  }
  return run(process.execPath, [path.join(root, "scripts", "verify-markdown-patches.cjs")], { allowFailure: true }).status === 0;
}
function normalizeVerifiedPatchLineEndings() {
  const contract = require("./markdown-patch-contract.json");
  let repaired = 0;
  for (const [name, expected] of Object.entries(contract.files)) {
    const file = path.join(root, "node_modules", name);
    if (!fs.existsSync(file)) fail(`Patch file missing: ${name}`);
    const bytes = fs.readFileSync(file);
    const verified = verifiedNormalizedBytes(bytes, expected);
    if (!verified) fail(`Patch content differs from pinned hash: ${name}`);
    if (verified === bytes) continue;
    fs.writeFileSync(file, verified);
    repaired++;
  }
  return repaired;
}
function ensureDependencies() {
  // A stamp plus top-level versions cannot prove transitive node_modules integrity.
  // Install from the pinned lock for every new SHA; the verified install receipt
  // above is the only no-op fast path.
  const install = npm(["ci", "--no-audit", "--no-fund"], { allowFailure: true, timeout: 1200000 });
  if (install.status !== 0) {
    const output = `${install.stdout}\n${install.stderr}`;
    if (!output.includes("Markdown patch missing or changed:")) fail(`npm ci failed: ${output.slice(-1800)}`);
    console.log("[update] checking Windows CRLF against pinned dependency bytes");
    normalizeVerifiedPatchLineEndings();
  }
  node("scripts/verify-markdown-patches.cjs");
  if (!dependenciesMatchLock()) fail("Installed dependency graph did not match package-lock.json");
  // npm postinstall owns this tracked generated file. Apply preflight asserted it was clean.
  const worker = "public/pdf.worker.min.mjs";
  if (git("status", "--porcelain", "--", worker)) {
    const committed = run("git", ["show", `HEAD:${worker}`]).stdout.replace(/\r\n/gu, "\n");
    const generated = fs.readFileSync(path.join(root, worker), "utf8").replace(/\r\n/gu, "\n");
    if (generated !== committed) fail("Generated PDF worker differs from the committed build artifact; review the dependency upgrade");
    git("restore", "--", worker);
  }
  if (git("status", "--porcelain", "--untracked-files=no")) fail("Dependency install unexpectedly changed tracked files");
}
function ensureTests(sha) {
  const stateFile = path.join(release, ".local-update-tests-state.json");
  const lockHash = hash(path.join(root, "package-lock.json"));
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch {}
  if (state.sha === sha && state.lockHash === lockHash && state.node === process.version) {
    console.log("[update] Windows regression smoke already passed for this SHA and dependency lock"); return;
  }
  // The main-branch Ubuntu CI runs the broad Notes/VMark suite. On Windows,
  // the repository's full suite includes POSIX-only symlink/mode assumptions;
  // run the relevant native editor/parser regression here instead of hiding
  // those failures behind a false green result.
  console.log("[update] running Windows editor/parser regression smoke");
  npm(["run", "quality:local-update-win:smoke"], { timeout: 300000 });
  fs.writeFileSync(stateFile, JSON.stringify({ sha, lockHash, node: process.version }, null, 2) + "\n");
}
function ensureBuild() {
  // Always compile a new commit: a pre-existing .next cannot be attributed to
  // the target SHA merely because it contains the same marker strings.
  let build = npm(["run", "build"], { allowFailure: true, timeout: 1200000 });
  if (build.status !== 0 && `${build.stdout}${build.stderr}`.includes("bundle lacks Markdown patch markers")) {
    console.log("[update] verified stale Next cache; rebuild once from a clean generated .next");
    fs.rmSync(path.join(root, ".next"), { recursive: true, force: true, maxRetries: 5, retryDelay: 600 });
    build = npm(["run", "build"], { allowFailure: true, timeout: 1200000 });
  }
  if (build.status !== 0) fail(`Production build failed: ${(build.stderr || build.stdout).slice(-1800)}`);
  node("scripts/verify-micromark-build.cjs");
}
function buildEnvironment(output) {
  return { ...process.env, AURIS_LOCAL_UPDATE_PROJECT: root, AURIS_LOCAL_UPDATE_OUTPUT: output,
    NODE_OPTIONS: `--require=${path.join(root, "scripts", "local-update-win-locks.cjs")}` };
}
function packageApp(version) {
  const output = path.join(release, `.local-update-${version}-${Date.now()}`);
  const env = buildEnvironment(output);
  console.log("[update] assembling verified Windows runtime closure");
  npm(["run", "desktop:assemble:win"], { env, timeout: 1200000 });
  const builder = path.join(root, "node_modules", "electron-builder", "out", "cli", "cli.js");
  run(process.execPath, [builder, "--win", "--config.npmRebuild=false", "--publish", "never", `--config.directories.output=${output}`], { env, timeout: 1800000 });
  const unpacked = path.join(output, "win-unpacked");
  const installer = path.join(output, `Auris-${version}-win-x64.exe`);
  if (!fs.existsSync(installer) || fs.statSync(installer).size < 1000000) fail("NSIS installer missing or unexpectedly small");
  verifyApp(unpacked, version);
  return { output, unpacked, installer };
}
function verifyApp(directory, version) {
  const exe = path.join(directory, "Auris.exe");
  const packed = path.join(directory, "resources", "app.asar");
  const manifest = JSON.parse(require("@electron/asar").extractFile(packed, "package.json").toString());
  if (manifest.version !== version) fail(`Packaged app version ${manifest.version} != ${version}`);
  if (!fs.existsSync(path.join(directory, "resources", "standalone", ".next", "BUILD_ID"))) fail("Packaged Next runtime is missing");
  const sidecar = path.join(directory, "resources", "app.asar", "electron", "auris-notes-mcp-server.mjs");
  const result = run(exe, [sidecar, "--health-check"], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "", NODE_PATH: "" }, timeout: 45000 });
  if (JSON.parse(result.stdout).status !== "ok") fail("Packaged MCP sidecar health check failed");
  return { exe, packed };
}
async function smoke(directory, output) {
  const executable = path.join(directory, "Auris.exe");
  const isolated = path.join(output, "isolated-user-data");
  fs.mkdirSync(isolated, { recursive: true });
  const env = { ...process.env, NODE_OPTIONS: "", NODE_PATH: "", AURIS_PACKAGED_SMOKE: "1", AURIS_PACKAGED_SMOKE_USER_DATA: isolated };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SHADOWING_DESKTOP_URL;
  const child = spawn(executable, [`--user-data-dir=${isolated}`], { cwd: directory, env, windowsHide: true, stdio: "ignore" });
  try {
    for (let attempt = 0; attempt < 90; attempt++) {
      if (child.exitCode !== null) fail(`Packaged app exited during isolated smoke (${child.exitCode})`);
      const logfile = path.join(isolated, "electron-startup.log");
      const log = fs.existsSync(logfile) ? fs.readFileSync(logfile, "utf8") : "";
      const ready = [...log.matchAll(/startNextServer:ready (http:\/\/127\.0\.0\.1:\d+)/gu)].at(-1)?.[1];
      if (ready) {
        try {
          for (const route of ["/", "/notes", "/video"]) {
            const response = await fetch(`${ready}${route}`, { signal: AbortSignal.timeout(12000) });
            if (response.status !== 200) fail(`Isolated ${route} returned ${response.status}`);
          }
          console.log(`[update] isolated packaged routes /, /notes, /video: HTTP 200 (${ready})`);
          return;
        } catch (error) { if (error.message.startsWith("Isolated")) throw error; }
      }
      await wait(1000);
    }
    fail("Packaged app failed to become ready within 90 seconds");
  } finally {
    if (child.pid) run("taskkill", ["/PID", String(child.pid), "/T", "/F"], { allowFailure: true, timeout: 15000 });
  }
}
function treeSummary(directory, includeContent = false) {
  const entries = [];
  function visit(current, relative = "") {
    for (const item of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, item.name), full = path.join(current, item.name);
      if (item.isDirectory()) visit(full, name);
      else if (item.isFile()) entries.push([name, fs.statSync(full).size, includeContent ? hash(full) : null]);
      else if (item.isSymbolicLink()) entries.push([name, fs.readlinkSync(full)]);
    }
  }
  visit(directory);
  return JSON.stringify(entries);
}
function backupInstall(version) {
  const backup = path.join(release, "backups", `windows-before-${version}-${Date.now()}`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.mkdirSync(backup);
  for (const [name, source] of [["installed-app", appDir], ["user-data", userData]]) {
    if (!fs.existsSync(source)) continue;
    const target = path.join(backup, name);
    fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true });
    if (treeSummary(source, name === "user-data") !== treeSummary(target, name === "user-data")) fail(`Backup content or inventory differs: ${name}`);
  }
  for (const file of ["Auris.exe", "resources/app.asar"]) {
    if (fs.existsSync(path.join(appDir, file)) && hash(path.join(appDir, file)) !== hash(path.join(backup, "installed-app", file))) fail(`Backup verification failed: ${file}`);
  }
  fs.writeFileSync(path.join(backup, "backup-info.json"), JSON.stringify({ versionBefore: installedVersion(), targetVersion: version, createdAt: new Date().toISOString() }, null, 2) + "\n");
  return backup;
}
function copyArtifact(source, destination) {
  if (fs.existsSync(destination)) {
    if (hash(source) !== hash(destination)) fail(`An artifact with different bytes already exists: ${destination}`);
  } else fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  if (hash(source) !== hash(destination)) fail(`Artifact copy check failed: ${destination}`);
}
async function update({ checkOnly = false } = {}) {
  assertIdentity({ allowDirty: checkOnly });
  const latest = currentRemote();
  const local = git("rev-parse", "HEAD");
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const installed = installedVersion();
  console.log(`[update] GitHub main ${latest.slice(0, 8)}; local ${local.slice(0, 8)}; installed ${installed || "none"}; source ${version}`);
  if (checkOnly && git("status", "--porcelain", "--untracked-files=no")) console.warn("[update] check only: tracked changes would block an actual update");
  // Check must not claim readiness when our branch is already ahead of the
  // exact fetched GitHub head; apply would otherwise fail at ff-only merge.
  if (local !== latest && git("rev-parse", "origin/main") === latest &&
    run("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], { allowFailure: true }).status !== 0) {
    fail("Local main contains unpublished or divergent commits; integrate them before updating");
  }
  const ci = ciForSha(latest);
  console.log(`[update] CI gate passed: run ${ci.runId} (${ci.testedSha.slice(0, 8)}${ci.docsOnly ? " + verified Markdown-only suffix" : ""})`);
  if (checkOnly) { console.log("[update] check only: no files, repository or App changed"); return; }
  if (local !== latest) {
    git("fetch", "--prune", "origin", "main");
    if (git("rev-parse", "origin/main") !== latest) fail("GitHub main moved while checking; rerun the updater");
    run("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
    git("merge", "--ff-only", "origin/main");
  }
  if (git("rev-parse", "HEAD") !== latest) fail("Local source SHA does not match GitHub main");
  const targetVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  if (!/^\d+\.\d+\.\d+$/u.test(targetVersion)) fail("Invalid release version");
  const receiptFile = path.join(release, ".local-update-install-state.json");
  let receipt = {};
  try { receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8")); } catch {}
  if (canSkipInstall(receipt, latest, targetVersion, installed, currentInstallHashes())) {
    console.log("[update] installed binary hashes match the prior verified SHA; no build/install needed"); return;
  }
  if (installed && compareVersions(targetVersion, installed) < 0) fail(`Refusing downgrade from ${installed} to ${targetVersion}`);
  assertNotRunning();
  ensureDependencies();
  node("scripts/local-update-win.test.mjs");
  ensureTests(latest);
  ensureBuild();
  const artifact = packageApp(targetVersion);
  await smoke(artifact.unpacked, artifact.output);
  // Immutable per-attempt delivery: a different commit with the same version cannot
  // collide with, overwrite, or silently reuse an older installer.
  const deliveryDir = path.join(release, "local-artifacts", latest, path.basename(artifact.output));
  fs.mkdirSync(deliveryDir, { recursive: true });
  const delivery = path.join(deliveryDir, path.basename(artifact.installer));
  copyArtifact(artifact.installer, delivery);
  const zip = path.join(artifact.output, `Auris-${targetVersion}-win-x64.zip`);
  if (fs.existsSync(zip)) copyArtifact(zip, path.join(deliveryDir, path.basename(zip)));
  if (currentRemote() !== latest) fail("GitHub main advanced during packaging; leave old installation unchanged and rerun");
  const backup = backupInstall(targetVersion);
  console.log(`[update] verified backup: ${backup}`);
  assertNotRunning();
  try {
    run(delivery, ["/S", `/D=${appDir}`], { timeout: 600000 });
    if (installedVersion() !== targetVersion) fail("Installer exited but installed version is wrong");
    verifyApp(appDir, targetVersion);
    for (const file of ["Auris.exe", "resources/app.asar", "resources/standalone/.next/BUILD_ID"]) {
      if (hash(path.join(appDir, file)) !== hash(path.join(artifact.unpacked, file))) fail(`Installed artifact mismatch: ${file}`);
    }
    await smoke(appDir, path.join(artifact.output, "installed-smoke"));
    fs.writeFileSync(receiptFile, JSON.stringify({ sha: latest, version: targetVersion, ...currentInstallHashes(), verifiedAt: new Date().toISOString(), backup }, null, 2) + "\n");
    console.log(`[update] installed ${targetVersion} and verified; installer ${delivery}; backup ${backup}`);
  } catch (error) {
    console.error(`[update] Installation verification failed. Backup retained: ${backup}. Do not retry blindly; inspect/restore the App before another update.`);
    throw error;
  }
}
if (require.main === module) {
  update({ checkOnly: process.argv.includes("--check") }).catch(error => { console.error(`[local-update] ${error.message}`); process.exitCode = 1; });
}
module.exports = { update, evaluateCiRuns, evaluateDocsOnlyCiProvenance, ciForSha, canSkipInstall, compareVersions, verifiedNormalizedBytes, dependenciesMatchLock, normalizeVerifiedPatchLineEndings, assertNotRunning, verifyApp, hash };
