const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const MAPPING_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_PATH_PATTERN =
  /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\/$).+$/;
const DISPOSITIONS = new Set([
  "copied",
  "adapted",
  "rewritten",
  "not-applicable",
]);
const ROOT_KEYS = ["$schema", "schemaVersion", "upstream", "entries"];
const UPSTREAM_KEYS = ["repository", "commit", "license"];
const ENTRY_KEYS = [
  "mappingId",
  "upstreamPaths",
  "aurisPaths",
  "disposition",
  "intentionalDifferences",
  "lastComparedCommit",
  "tests",
];
const DEFAULT_GIT_TIMEOUT_MS = 30_000;
const DEFAULT_PROCESS_IDENTITY_TIMEOUT_MS = 2_000;

const EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  ARGUMENT_INVALID: 2,
  MANIFEST_INVALID: 3,
  GIT_MISSING: 4,
  CACHE_INVALID: 5,
  CACHE_IDENTITY: 6,
  CACHE_BUSY: 7,
  GIT_FETCH_FAILED: 8,
  UPSTREAM_UNRESOLVED: 9,
  COMPARISON_FAILED: 10,
  REPORT_WRITE_FAILED: 11,
  INTERNAL_ERROR: 12,
});

const PUBLIC_FAILURE_MESSAGES = Object.freeze({
  ARGUMENT_INVALID: "Command arguments are invalid.",
  MANIFEST_INVALID: "The VMark port manifest is invalid.",
  GIT_MISSING: "Git is required.",
  CACHE_INVALID: "The upstream cache is not a safe Auris cache directory.",
  CACHE_IDENTITY: "The upstream cache does not match the manifest repository.",
  CACHE_BUSY: "The upstream cache is currently in use.",
  GIT_FETCH_FAILED: "The upstream cache could not be refreshed.",
  UPSTREAM_UNRESOLVED: "The selected upstream commit could not be resolved.",
  COMPARISON_FAILED: "The upstream comparison could not be completed.",
  REPORT_WRITE_FAILED: "The comparison reports could not be written.",
  INTERNAL_ERROR: "The comparison command failed unexpectedly.",
});

class SyncReportError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "SyncReportError";
    this.code = code;
    this.exitCode = EXIT_CODES[code] || EXIT_CODES.INTERNAL_ERROR;
    this.publicMessage =
      PUBLIC_FAILURE_MESSAGES[code] || PUBLIC_FAILURE_MESSAGES.INTERNAL_ERROR;
  }
}

function failure(code, detail, cause) {
  return new SyncReportError(code, detail, cause ? { cause } : undefined);
}

function parseArgs(argv) {
  if (!Array.isArray(argv)) {
    throw failure("ARGUMENT_INVALID", "Arguments must be an array.");
  }

  let upstream = "origin/main";
  let seenUpstream = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--upstream") {
      throw failure("ARGUMENT_INVALID", `Unknown argument: ${argument}`);
    }
    if (seenUpstream) {
      throw failure("ARGUMENT_INVALID", "--upstream may be supplied only once.");
    }
    if (index + 1 >= argv.length) {
      throw failure("ARGUMENT_INVALID", "--upstream requires a value.");
    }
    seenUpstream = true;
    upstream = argv[index + 1];
    index += 1;
  }

  if (upstream !== "origin/main" && !FULL_COMMIT_PATTERN.test(upstream)) {
    throw failure(
      "ARGUMENT_INVALID",
      "--upstream must be a full 40-character hexadecimal commit or origin/main.",
    );
  }

  return { upstream };
}

function validateManifest(manifest) {
  assertPlainObject(manifest, "manifest");
  assertExactKeys(manifest, ROOT_KEYS, "manifest");
  if (manifest.$schema !== "./manifest.schema.json") {
    throw manifestFailure('manifest.$schema must equal "./manifest.schema.json".');
  }
  if (manifest.schemaVersion !== 1) {
    throw manifestFailure("manifest.schemaVersion must equal 1.");
  }

  assertPlainObject(manifest.upstream, "manifest.upstream");
  assertExactKeys(manifest.upstream, UPSTREAM_KEYS, "manifest.upstream");
  try {
    new URL(manifest.upstream.repository);
  } catch {
    throw manifestFailure("manifest.upstream.repository must be a valid URI.");
  }
  assertFullCommit(manifest.upstream.commit, "manifest.upstream.commit", "MANIFEST_INVALID");
  if (manifest.upstream.license !== "ISC") {
    throw manifestFailure('manifest.upstream.license must equal "ISC".');
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw manifestFailure("manifest.entries must be a non-empty array.");
  }

  const mappingIds = new Set();
  manifest.entries.forEach((entry, index) => {
    const label = `manifest.entries[${index}]`;
    assertPlainObject(entry, label);
    assertExactKeys(entry, ENTRY_KEYS, label);
    if (
      typeof entry.mappingId !== "string" ||
      !MAPPING_ID_PATTERN.test(entry.mappingId)
    ) {
      throw manifestFailure(`${label}.mappingId is invalid.`);
    }
    if (mappingIds.has(entry.mappingId)) {
      throw manifestFailure(`duplicate mappingId: ${entry.mappingId}`);
    }
    mappingIds.add(entry.mappingId);

    validatePathArray(entry.upstreamPaths, `${label}.upstreamPaths`);
    validatePathArray(entry.aurisPaths, `${label}.aurisPaths`);
    if (!DISPOSITIONS.has(entry.disposition)) {
      throw manifestFailure(`${label}.disposition is invalid.`);
    }
    validateStringArray(
      entry.intentionalDifferences,
      `${label}.intentionalDifferences`,
    );
    assertFullCommit(
      entry.lastComparedCommit,
      `${label}.lastComparedCommit`,
      "MANIFEST_INVALID",
    );
    validatePathArray(entry.tests, `${label}.tests`);
  });

  return manifest;
}

function createGitRunner({
  spawn = spawnSync,
  timeoutMs = DEFAULT_GIT_TIMEOUT_MS,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Git timeout must be a positive integer.");
  }

  return (argv, options = {}) => {
    const {
      cwd,
      failureCode = "COMPARISON_FAILED",
      publicDetail = PUBLIC_FAILURE_MESSAGES[failureCode],
    } = options;
    const fixedArgv = cwd ? ["-C", cwd, ...argv] : [...argv];
    const result = spawn("git", fixedArgv, {
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 8 * 1024 * 1024,
      shell: false,
      timeout: timeoutMs,
      windowsHide: true,
    });

    if (result.error) {
      if (result.error.code === "ENOENT") {
        throw failure("GIT_MISSING", "Git executable was not found.", result.error);
      }
      throw failure(failureCode, publicDetail, result.error);
    }
    if (result.status !== 0) {
      throw failure(failureCode, publicDetail);
    }
    return typeof result.stdout === "string"
      ? result.stdout
      : Buffer.from(result.stdout || "").toString("utf8");
  };
}

const defaultGitRunner = createGitRunner();

function createProcessStartIdentityProvider({
  platform = process.platform,
  spawn = spawnSync,
  timeoutMs = DEFAULT_PROCESS_IDENTITY_TIMEOUT_MS,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Process identity timeout must be a positive integer.");
  }

  return (pid) => {
    if (!Number.isInteger(pid) || pid <= 0) return undefined;
    const isWindows = platform === "win32";
    const command = isWindows ? "powershell.exe" : "ps";
    const argv = isWindows
      ? [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$process = Get-Process -Id $args[0] -ErrorAction Stop; $process.StartTime.ToUniversalTime().ToString('o')",
          String(pid),
        ]
      : ["-o", "lstart=", "-p", String(pid)];
    let result;
    try {
      result = spawn(command, argv, {
        encoding: "utf8",
        env: {
          ...process.env,
          LC_ALL: "C",
          ...(isWindows ? {} : { TZ: "UTC" }),
        },
        shell: false,
        timeout: timeoutMs,
        windowsHide: true,
      });
    } catch {
      return undefined;
    }
    if (!result || result.error || result.status !== 0) return undefined;
    const output = String(result.stdout || "").trim().replace(/\s+/g, " ");
    if (!output || output.length > 256) return undefined;
    return `${isWindows ? "windows" : "posix"}:${output}`;
  };
}

const defaultProcessStartIdentityProvider =
  createProcessStartIdentityProvider();

function collectGitDiff({
  repository,
  baselineCommit,
  upstream,
  gitRunner = defaultGitRunner,
}) {
  if (typeof repository !== "string" || repository.length === 0) {
    throw failure("COMPARISON_FAILED", "A Git repository path is required.");
  }
  assertFullCommit(baselineCommit, "baseline commit", "COMPARISON_FAILED");
  if (upstream !== "origin/main" && !FULL_COMMIT_PATTERN.test(upstream)) {
    throw failure(
      "ARGUMENT_INVALID",
      "Upstream must be a full 40-character hexadecimal commit or origin/main.",
    );
  }

  const resolvedBaseline = runGitStep(
    gitRunner,
    ["rev-parse", "--verify", `${baselineCommit}^{commit}`],
    {
      cwd: repository,
      failureCode: "UPSTREAM_UNRESOLVED",
      publicDetail: PUBLIC_FAILURE_MESSAGES.UPSTREAM_UNRESOLVED,
    },
  ).trim();
  if (resolvedBaseline !== baselineCommit) {
    throw failure(
      "UPSTREAM_UNRESOLVED",
      "The manifest baseline did not resolve exactly.",
    );
  }

  const resolvedCommit = runGitStep(
    gitRunner,
    ["rev-parse", "--verify", `${upstream}^{commit}`],
    {
      cwd: repository,
      failureCode: "UPSTREAM_UNRESOLVED",
      publicDetail: PUBLIC_FAILURE_MESSAGES.UPSTREAM_UNRESOLVED,
    },
  ).trim();
  if (!FULL_COMMIT_PATTERN.test(resolvedCommit)) {
    throw failure(
      "UPSTREAM_UNRESOLVED",
      "The selected upstream did not resolve to a full commit.",
    );
  }
  if (FULL_COMMIT_PATTERN.test(upstream) && resolvedCommit !== upstream) {
    throw failure(
      "UPSTREAM_UNRESOLVED",
      "The selected upstream did not resolve exactly.",
    );
  }

  const rawDiff = runGitStep(
    gitRunner,
    [
      "diff",
      "--name-status",
      "-z",
      "-M",
      "--no-ext-diff",
      resolvedBaseline,
      resolvedCommit,
      "--",
    ],
    {
      cwd: repository,
      failureCode: "COMPARISON_FAILED",
      publicDetail: PUBLIC_FAILURE_MESSAGES.COMPARISON_FAILED,
    },
  );

  return {
    resolvedCommit,
    changes: parseGitDiff(rawDiff),
  };
}

function parseGitDiff(rawDiff) {
  const fields = rawDiff.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes = [];

  for (let index = 0; index < fields.length; ) {
    const gitStatus = fields[index];
    index += 1;
    if (/^R\d+$/.test(gitStatus)) {
      const fromPath = fields[index];
      const targetPath = fields[index + 1];
      if (!fromPath || !targetPath) {
        throw failure("COMPARISON_FAILED", "Git returned an incomplete rename record.");
      }
      changes.push({
        fromPath,
        path: targetPath,
        status: "renamed",
      });
      index += 2;
      continue;
    }

    const targetPath = fields[index];
    index += 1;
    if (!targetPath) {
      throw failure("COMPARISON_FAILED", "Git returned an incomplete path record.");
    }
    changes.push({ path: targetPath, status: normalizeGitStatus(gitStatus) });
  }

  return sortChanges(changes);
}

function normalizeRepositoryUrl(repositoryUrl) {
  let normalized;
  try {
    normalized = new URL(repositoryUrl);
  } catch (error) {
    throw failure("CACHE_IDENTITY", "The repository URL is invalid.", error);
  }
  if (normalized.username || normalized.password) {
    throw failure("CACHE_IDENTITY", "Repository URLs may not contain credentials.");
  }
  normalized.hash = "";
  normalized.pathname = normalized.pathname
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  return normalized.href.replace(/\/$/, "");
}

function defaultCacheRoot() {
  const owner = typeof process.getuid === "function" ? process.getuid() : "user";
  return path.join(os.tmpdir(), `auris-vmark-sync-${owner}`);
}

function resolveCachePaths({ repositoryUrl, cacheRoot = defaultCacheRoot() }) {
  const normalizedRepository = normalizeRepositoryUrl(repositoryUrl);
  const resolvedRoot = path.resolve(cacheRoot);
  const repositoryHash = crypto
    .createHash("sha256")
    .update(normalizedRepository)
    .digest("hex")
    .slice(0, 24);
  const cacheName = `repository-${repositoryHash}`;
  const cacheDirectory = path.join(resolvedRoot, cacheName);
  const lockDirectory = path.join(resolvedRoot, `${cacheName}.lock`);
  if (
    path.dirname(cacheDirectory) !== resolvedRoot ||
    path.dirname(lockDirectory) !== resolvedRoot
  ) {
    throw failure("CACHE_INVALID", "The derived cache path escaped its root.");
  }
  return {
    cacheDirectory,
    cacheName,
    cacheRoot: resolvedRoot,
    lockDirectory,
    normalizedRepository,
  };
}

function prepareUpstreamCache(
  repositoryUrl,
  {
    cacheRoot = defaultCacheRoot(),
    gitRunner = defaultGitRunner,
    lockOptions = {},
  } = {},
) {
  const paths = resolveCachePaths({ repositoryUrl, cacheRoot });
  ensurePrivateCacheRoot(paths.cacheRoot);
  const cacheLock = acquireOwnershipLock(paths.lockDirectory, {
    busyCode: "CACHE_BUSY",
    invalidCode: "CACHE_INVALID",
    purpose: "cache",
    ...lockOptions,
  });
  let temporaryDirectory;

  try {
    if (fs.existsSync(paths.cacheDirectory)) {
      assertSafeCacheDirectory(paths.cacheDirectory);
    } else {
      temporaryDirectory = fs.mkdtempSync(
        path.join(paths.cacheRoot, `${paths.cacheName}.init-`),
      );
      fs.chmodSync(temporaryDirectory, 0o700);
      runGitStep(
        gitRunner,
        ["clone", "--no-checkout", repositoryUrl, temporaryDirectory],
        {
          failureCode: "GIT_FETCH_FAILED",
          publicDetail: PUBLIC_FAILURE_MESSAGES.GIT_FETCH_FAILED,
        },
      );
      assertSafeCacheDirectory(temporaryDirectory);
      verifyCacheIdentity(
        temporaryDirectory,
        paths.normalizedRepository,
        gitRunner,
      );
      try {
        fs.renameSync(temporaryDirectory, paths.cacheDirectory);
      } catch (error) {
        throw failure("CACHE_BUSY", "The cache was initialized concurrently.", error);
      }
      temporaryDirectory = undefined;
    }

    verifyCacheIdentity(
      paths.cacheDirectory,
      paths.normalizedRepository,
      gitRunner,
    );
    runGitStep(gitRunner, ["fetch", "--prune", "origin"], {
      cwd: paths.cacheDirectory,
      failureCode: "GIT_FETCH_FAILED",
      publicDetail: PUBLIC_FAILURE_MESSAGES.GIT_FETCH_FAILED,
    });
    return paths.cacheDirectory;
  } catch (error) {
    throw normalizeFailure(error, "CACHE_INVALID");
  } finally {
    if (temporaryDirectory) {
      removeValidatedTemporaryDirectory(temporaryDirectory, paths);
    }
    cacheLock.release();
  }
}

function ensurePrivateCacheRoot(cacheRoot) {
  try {
    if (!fs.existsSync(cacheRoot)) {
      fs.mkdirSync(cacheRoot, { mode: 0o700, recursive: true });
    }
    const stat = fs.lstatSync(cacheRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw failure("CACHE_INVALID", "The cache root is not a directory.");
    }
    assertOwned(stat);
    if ((stat.mode & 0o077) !== 0) {
      throw failure("CACHE_INVALID", "The cache root is not private.");
    }
  } catch (error) {
    throw normalizeFailure(error, "CACHE_INVALID");
  }
}

function assertSafeCacheDirectory(directory) {
  try {
    const directoryStat = fs.lstatSync(directory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw failure("CACHE_INVALID", "The cache entry is not a directory.");
    }
    assertOwned(directoryStat);
    if ((directoryStat.mode & 0o077) !== 0) {
      fs.chmodSync(directory, 0o700);
    }
    const gitDirectory = path.join(directory, ".git");
    const gitStat = fs.lstatSync(gitDirectory);
    if (gitStat.isSymbolicLink() || !gitStat.isDirectory()) {
      throw failure("CACHE_INVALID", "The cache Git metadata is invalid.");
    }
    assertOwned(gitStat);
  } catch (error) {
    throw normalizeFailure(error, "CACHE_INVALID");
  }
}

function assertOwned(stat, failureCode = "CACHE_INVALID") {
  if (
    typeof process.getuid === "function" &&
    typeof stat.uid === "number" &&
    stat.uid !== process.getuid()
  ) {
    throw failure(failureCode, "The path is owned by another user.");
  }
}

function acquireOwnershipLock(lockDirectory, options = {}) {
  const {
    busyCode = "CACHE_BUSY",
    fileSystem = fs,
    invalidCode = "CACHE_INVALID",
    malformedStaleMs = 5 * 60 * 1000,
    now = Date.now,
    pid = process.pid,
    processStartIdentityProvider = defaultProcessStartIdentityProvider,
    purpose = "sync",
    randomToken = () => crypto.randomUUID(),
  } = options;
  const observedProcessStartIdentity = Object.hasOwn(
    options,
    "processStartIdentity",
  )
    ? options.processStartIdentity
    : processStartIdentityProvider(pid);
  const processStartIdentity =
    typeof observedProcessStartIdentity === "string" &&
    observedProcessStartIdentity.length > 0 &&
    observedProcessStartIdentity.length <= 264
      ? observedProcessStartIdentity
      : null;
  const isProcessAlive =
    options.isProcessAlive ||
    ((ownerPid, ownerStartIdentity) =>
      defaultIsProcessAlive(ownerPid, ownerStartIdentity, {
        processStartIdentityProvider,
      }));
  const token = randomToken();
  const metadata = {
    version: 2,
    token,
    pid,
    processStartIdentity,
    acquiredAtMs: now(),
    purpose,
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      fileSystem.mkdirSync(lockDirectory, { mode: 0o700 });
      const createdLockStat = fileSystem.lstatSync(lockDirectory);
      try {
        writeDurableText(
          fileSystem,
          path.join(lockDirectory, "owner.json"),
          `${JSON.stringify(metadata)}\n`,
          { flag: "wx", mode: 0o600 },
        );
        syncDirectory(fileSystem, lockDirectory);
      } catch (error) {
        removeNewlyCreatedLock(fileSystem, lockDirectory, createdLockStat);
        throw failure(invalidCode, "Lock ownership metadata could not be created.", error);
      }
      return {
        lockDirectory,
        token,
        release() {
          return releaseOwnershipLock(lockDirectory, this.token, {
            fileSystem,
            invalidCode,
            randomToken,
          });
        },
      };
    } catch (error) {
      if (!error || error.code !== "EEXIST") {
        throw normalizeFailure(error, invalidCode);
      }
    }

    const inspection = inspectOwnershipLock(lockDirectory, {
      fileSystem,
      invalidCode,
      malformedStaleMs,
      now,
    });
    if (
      inspection.metadata &&
      isProcessAlive(
        inspection.metadata.pid,
        inspection.metadata.processStartIdentity,
      )
    ) {
      throw failure(busyCode, "The lock owner process is still alive.");
    }
    if (inspection.malformed && !inspection.stale) {
      throw failure(busyCode, "Fresh malformed lock metadata is held conservatively.");
    }
    if (
      !reclaimOwnershipLock(lockDirectory, inspection, {
        fileSystem,
        invalidCode,
        randomToken,
      })
    ) {
      throw failure(busyCode, "The lock changed while recovery was attempted.");
    }
  }
  throw failure(busyCode, "The lock could not be acquired after recovery.");
}

function inspectOwnershipLock(
  lockDirectory,
  { fileSystem, invalidCode, malformedStaleMs, now },
) {
  let lockStat;
  try {
    lockStat = fileSystem.lstatSync(lockDirectory);
    if (lockStat.isSymbolicLink() || !lockStat.isDirectory()) {
      throw failure(invalidCode, "The lock path is unsafe.");
    }
    assertOwned(lockStat, invalidCode);
  } catch (error) {
    throw normalizeFailure(error, invalidCode);
  }

  const metadataPath = path.join(lockDirectory, "owner.json");
  let metadataStat;
  try {
    metadataStat = fileSystem.lstatSync(metadataPath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw normalizeFailure(error, invalidCode);
    }
    return malformedLockInspection(lockStat, malformedStaleMs, now);
  }
  if (metadataStat.isSymbolicLink() || !metadataStat.isFile()) {
    throw failure(invalidCode, "Lock ownership metadata is unsafe.");
  }
  assertOwned(metadataStat, invalidCode);
  try {
    const metadata = JSON.parse(fileSystem.readFileSync(metadataPath, "utf8"));
    if (!isValidLockMetadata(metadata)) {
      throw new Error("owner metadata has an invalid shape");
    }
    return { lockStat, malformed: false, metadata, stale: false };
  } catch {
    return malformedLockInspection(lockStat, malformedStaleMs, now);
  }
}

function malformedLockInspection(lockStat, malformedStaleMs, now) {
  return {
    lockStat,
    malformed: true,
    metadata: undefined,
    stale: now() - lockStat.mtimeMs >= malformedStaleMs,
  };
}

function isValidLockMetadata(metadata) {
  return (
    metadata &&
    metadata.version === 2 &&
    typeof metadata.token === "string" &&
    metadata.token.length >= 16 &&
    Number.isInteger(metadata.pid) &&
    metadata.pid > 0 &&
    (metadata.processStartIdentity === null ||
      (typeof metadata.processStartIdentity === "string" &&
        metadata.processStartIdentity.length > 0 &&
        metadata.processStartIdentity.length <= 264)) &&
    Number.isFinite(metadata.acquiredAtMs) &&
    typeof metadata.purpose === "string" &&
    metadata.purpose.length > 0
  );
}

function defaultIsProcessAlive(
  pid,
  expectedStartIdentity,
  {
    processStartIdentityProvider = defaultProcessStartIdentityProvider,
  } = {},
) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return Boolean(error && error.code !== "ESRCH");
  }
  if (!expectedStartIdentity) return true;
  const actualStartIdentity = processStartIdentityProvider(pid);
  if (!actualStartIdentity) return true;
  return actualStartIdentity === expectedStartIdentity;
}

function reclaimOwnershipLock(
  lockDirectory,
  inspection,
  { fileSystem, invalidCode, randomToken },
) {
  const quarantine = `${lockDirectory}.reclaim-${randomToken()}`;
  try {
    fileSystem.renameSync(lockDirectory, quarantine);
  } catch (error) {
    if (error && error.code === "ENOENT") return true;
    throw failure(invalidCode, "The stale lock could not be quarantined.", error);
  }

  const matches = quarantinedLockMatches(fileSystem, quarantine, inspection);
  if (!matches) {
    restoreDisplacedLock(fileSystem, quarantine, lockDirectory);
    return false;
  }
  fileSystem.rmSync(quarantine, { recursive: true, force: true });
  return true;
}

function releaseOwnershipLock(
  lockDirectory,
  token,
  { fileSystem = fs, invalidCode = "CACHE_INVALID", randomToken = () => crypto.randomUUID() } = {},
) {
  let inspection;
  try {
    inspection = inspectOwnershipLock(lockDirectory, {
      fileSystem,
      invalidCode,
      malformedStaleMs: Number.POSITIVE_INFINITY,
      now: Date.now,
    });
  } catch {
    return false;
  }
  if (!inspection.metadata || inspection.metadata.token !== token) return false;

  const quarantine = `${lockDirectory}.release-${randomToken()}`;
  try {
    fileSystem.renameSync(lockDirectory, quarantine);
  } catch {
    return false;
  }
  const moved = inspectQuarantinedMetadata(fileSystem, quarantine);
  if (!moved || moved.token !== token) {
    restoreDisplacedLock(fileSystem, quarantine, lockDirectory);
    return false;
  }
  fileSystem.rmSync(quarantine, { recursive: true, force: true });
  return true;
}

function quarantinedLockMatches(fileSystem, quarantine, inspection) {
  if (inspection.metadata) {
    const moved = inspectQuarantinedMetadata(fileSystem, quarantine);
    return moved && moved.token === inspection.metadata.token;
  }
  try {
    const movedStat = fileSystem.lstatSync(quarantine);
    return (
      movedStat.dev === inspection.lockStat.dev &&
      movedStat.ino === inspection.lockStat.ino
    );
  } catch {
    return false;
  }
}

function inspectQuarantinedMetadata(fileSystem, quarantine) {
  try {
    const stat = fileSystem.lstatSync(quarantine);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return undefined;
    assertOwned(stat, "REPORT_WRITE_FAILED");
    const metadataPath = path.join(quarantine, "owner.json");
    const metadataStat = fileSystem.lstatSync(metadataPath);
    if (metadataStat.isSymbolicLink() || !metadataStat.isFile()) return undefined;
    const metadata = JSON.parse(fileSystem.readFileSync(metadataPath, "utf8"));
    return isValidLockMetadata(metadata) ? metadata : undefined;
  } catch {
    return undefined;
  }
}

function restoreDisplacedLock(fileSystem, quarantine, lockDirectory) {
  try {
    if (!fileSystem.existsSync(lockDirectory)) {
      fileSystem.renameSync(quarantine, lockDirectory);
    }
  } catch {
    // Never delete a quarantined lock whose ownership changed during recovery.
  }
}

function removeNewlyCreatedLock(fileSystem, lockDirectory, createdLockStat) {
  try {
    const stat = fileSystem.lstatSync(lockDirectory);
    if (
      !stat.isSymbolicLink() &&
      stat.isDirectory() &&
      stat.dev === createdLockStat.dev &&
      stat.ino === createdLockStat.ino
    ) {
      fileSystem.rmSync(lockDirectory, { recursive: true, force: true });
    }
  } catch {
    // A failed metadata write remains recoverable through malformed-lock aging.
  }
}

function removeValidatedTemporaryDirectory(temporaryDirectory, paths) {
  const expectedPrefix = `${paths.cacheName}.init-`;
  if (
    path.dirname(temporaryDirectory) !== paths.cacheRoot ||
    !path.basename(temporaryDirectory).startsWith(expectedPrefix)
  ) {
    return;
  }
  try {
    const stat = fs.lstatSync(temporaryDirectory);
    if (!stat.isSymbolicLink() && stat.isDirectory()) {
      assertOwned(stat);
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup of a validated, task-owned temporary directory.
  }
}

function verifyCacheIdentity(cacheDirectory, expectedRepository, gitRunner) {
  const actualRepository = runGitStep(
    gitRunner,
    ["remote", "get-url", "origin"],
    {
      cwd: cacheDirectory,
      failureCode: "CACHE_IDENTITY",
      publicDetail: PUBLIC_FAILURE_MESSAGES.CACHE_IDENTITY,
    },
  ).trim();
  if (normalizeRepositoryUrl(actualRepository) !== expectedRepository) {
    throw failure("CACHE_IDENTITY", "The cache origin does not match the manifest.");
  }
}

function renderReports({ manifest, resolvedCommit, changes, aurisRoot }) {
  validateManifest(manifest);
  assertFullCommit(resolvedCommit, "resolved commit", "COMPARISON_FAILED");
  if (!Array.isArray(changes)) {
    throw failure("COMPARISON_FAILED", "changes must be an array.");
  }
  if (typeof aurisRoot !== "string" || aurisRoot.length === 0) {
    throw failure("COMPARISON_FAILED", "aurisRoot is required.");
  }

  const sortedChanges = sortChanges(changes.map(normalizeChange));
  const mappedChangeKeys = new Set();
  const mappings = [...manifest.entries]
    .sort((left, right) => compareText(left.mappingId, right.mappingId))
    .map((entry) => {
      const matchedUpstreamChanges = sortedChanges.filter((change) => {
        const matched =
          entry.upstreamPaths.some((mappedPath) =>
            mappedPathMatches(mappedPath, change.path),
          ) ||
          (change.status === "renamed" &&
            entry.upstreamPaths.some((mappedPath) =>
              mappedPathMatches(mappedPath, change.fromPath),
            ));
        if (matched) mappedChangeKeys.add(changeKey(change));
        return matched;
      });
      const missingAurisTargets = [...entry.aurisPaths]
        .filter((target) => !fs.existsSync(path.resolve(aurisRoot, target)))
        .sort(compareText);

      return {
        mappingId: entry.mappingId,
        disposition: entry.disposition,
        upstreamPaths: [...entry.upstreamPaths].sort(compareText),
        aurisPaths: [...entry.aurisPaths].sort(compareText),
        matchedUpstreamChanges,
        missingAurisTargets,
        lastComparedCommit: entry.lastComparedCommit,
        staleLastComparedCommit: entry.lastComparedCommit !== resolvedCommit,
        intentionalDifferences: [...entry.intentionalDifferences].sort(compareText),
        tests: [...entry.tests].sort(compareText),
      };
    });

  const unmappedUpstreamChanges = sortedChanges.filter(
    (change) => !mappedChangeKeys.has(changeKey(change)),
  );
  const count = (status) =>
    sortedChanges.filter((change) => change.status === status).length;
  const report = {
    schemaVersion: 1,
    repository: manifest.upstream.repository,
    baselineCommit: manifest.upstream.commit,
    comparedCommit: resolvedCommit,
    summary: {
      changed: count("changed"),
      added: count("added"),
      deleted: count("deleted"),
      renamed: count("renamed"),
      missingAurisTargets: mappings.reduce(
        (total, mapping) => total + mapping.missingAurisTargets.length,
        0,
      ),
      staleMappings: mappings.filter((mapping) => mapping.staleLastComparedCommit)
        .length,
      unmappedUpstreamChanges: unmappedUpstreamChanges.length,
    },
    upstreamChanges: sortedChanges,
    mappings,
    unmappedUpstreamChanges,
  };

  return {
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: renderMarkdown(report),
    report,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# VMark upstream comparison",
    "",
    `- Repository: ${report.repository}`,
    `- Baseline commit: \`${report.baselineCommit}\``,
    `- Compared commit: \`${report.comparedCommit}\``,
    `- Changed: **${report.summary.changed}**`,
    `- Added: **${report.summary.added}**`,
    `- Deleted: **${report.summary.deleted}**`,
    `- Renamed: **${report.summary.renamed}**`,
    `- Missing Auris targets: **${report.summary.missingAurisTargets}**`,
    `- Stale mappings: **${report.summary.staleMappings}**`,
    `- Unmapped upstream changes: **${report.summary.unmappedUpstreamChanges}**`,
    "",
    "## Upstream changes",
    "",
  ];

  if (report.upstreamChanges.length === 0) {
    lines.push("No upstream changes between the selected commits.", "");
  } else {
    for (const change of report.upstreamChanges) {
      lines.push(`- **${change.status}** ${formatChangeMarkdown(change)}`);
    }
    lines.push("");
  }

  lines.push("## Mappings", "");
  for (const mapping of report.mappings) {
    lines.push(
      `### \`${mapping.mappingId}\``,
      "",
      `- Disposition: \`${mapping.disposition}\``,
      `- Last compared commit: \`${mapping.lastComparedCommit}\`${
        mapping.staleLastComparedCommit ? " (stale)" : ""
      }`,
      `- Matched upstream changes: ${mapping.matchedUpstreamChanges.length}`,
      `- Missing Auris targets: ${mapping.missingAurisTargets.length}`,
    );
    for (const target of mapping.missingAurisTargets) {
      lines.push(`  - \`${target}\``);
    }
    lines.push("");
  }

  lines.push("## Unmapped upstream changes", "");
  if (report.unmappedUpstreamChanges.length === 0) {
    lines.push("None.", "");
  } else {
    for (const change of report.unmappedUpstreamChanges) {
      lines.push(`- **${change.status}** ${formatChangeMarkdown(change)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatChangeMarkdown(change) {
  return change.status === "renamed"
    ? `\`${change.fromPath}\` → \`${change.path}\``
    : `\`${change.path}\``;
}

/**
 * Canonical JSON and Markdown cannot share one cross-platform atomic rename.
 * Publication is therefore serialized and journaled: lock-aware readers see a
 * matching pair, and the next reader or command completes an interrupted pair.
 */
function publishReportsWithRecovery({
  outputDirectory,
  reports,
  fileSystem = fs,
  afterMutation = () => {},
  lockOptions = {},
}) {
  fileSystem.mkdirSync(outputDirectory, { recursive: true });
  const lockDirectory = path.join(outputDirectory, ".vmark-sync-write.lock");
  const transactionDirectory = path.join(
    outputDirectory,
    ".vmark-sync-transaction",
  );
  const reportLock = acquireOwnershipLock(lockDirectory, {
    busyCode: "REPORT_WRITE_FAILED",
    fileSystem,
    invalidCode: "REPORT_WRITE_FAILED",
    purpose: "report-writer",
    ...lockOptions,
  });
  let journalDurable = false;
  try {
    recoverReportTransaction({ fileSystem, outputDirectory });
    fileSystem.mkdirSync(transactionDirectory, { mode: 0o700 });
    const nextJson = path.join(transactionDirectory, "next.json");
    const nextMarkdown = path.join(transactionDirectory, "next.md");
    writeDurableText(fileSystem, nextJson, reports.json, {
      flag: "wx",
      mode: 0o600,
    });
    writeDurableText(fileSystem, nextMarkdown, reports.markdown, {
      flag: "wx",
      mode: 0o600,
    });
    const journal = {
      version: 1,
      newJsonSha256: sha256Text(reports.json),
      newMarkdownSha256: sha256Text(reports.markdown),
    };
    writeDurableText(
      fileSystem,
      path.join(transactionDirectory, "journal.json"),
      `${JSON.stringify(journal)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    syncDirectory(fileSystem, transactionDirectory);
    syncDirectory(fileSystem, outputDirectory);
    journalDurable = true;
    afterMutation("prepared");
    completeReportTransaction({
      afterMutation,
      fileSystem,
      journal,
      outputDirectory,
      transactionDirectory,
    });
    removeCompletedTransaction(fileSystem, transactionDirectory, outputDirectory);
  } catch (error) {
    if (!journalDurable) {
      removeIncompleteTransaction(fileSystem, transactionDirectory);
    }
    throw failure(
      "REPORT_WRITE_FAILED",
      "The journaled report publication did not complete.",
      error,
    );
  } finally {
    reportLock.release();
  }
}

function completeReportTransaction({
  afterMutation = () => {},
  fileSystem,
  journal,
  outputDirectory,
  transactionDirectory,
}) {
  const finalJson = path.join(outputDirectory, "latest.json");
  const finalMarkdown = path.join(outputDirectory, "latest.md");
  const nextJson = path.join(transactionDirectory, "next.json");
  const nextMarkdown = path.join(transactionDirectory, "next.md");
  const previousJson = path.join(transactionDirectory, "previous.json");
  const previousMarkdown = path.join(transactionDirectory, "previous.md");
  const jsonAlreadyPublished = fileHashEquals(
    fileSystem,
    finalJson,
    journal.newJsonSha256,
  );
  if (!jsonAlreadyPublished && fileSystem.existsSync(finalJson)) {
    if (fileSystem.existsSync(previousJson)) {
      throw failure("REPORT_WRITE_FAILED", "Conflicting JSON recovery backup.");
    }
    fileSystem.renameSync(finalJson, previousJson);
    syncPublicationDirectories(fileSystem, outputDirectory, transactionDirectory);
    afterMutation("json-backed-up");
  }

  const markdownAlreadyPublished = fileHashEquals(
    fileSystem,
    finalMarkdown,
    journal.newMarkdownSha256,
  );
  if (!markdownAlreadyPublished && fileSystem.existsSync(finalMarkdown)) {
    if (fileSystem.existsSync(previousMarkdown)) {
      throw failure("REPORT_WRITE_FAILED", "Conflicting Markdown recovery backup.");
    }
    fileSystem.renameSync(finalMarkdown, previousMarkdown);
    syncPublicationDirectories(fileSystem, outputDirectory, transactionDirectory);
    afterMutation("markdown-backed-up");
  }

  if (!fileHashEquals(fileSystem, finalJson, journal.newJsonSha256)) {
    requireTransactionFile(fileSystem, nextJson, journal.newJsonSha256);
    fileSystem.renameSync(nextJson, finalJson);
    syncPublicationDirectories(fileSystem, outputDirectory, transactionDirectory);
    afterMutation("json-published");
  }
  if (!fileHashEquals(fileSystem, finalMarkdown, journal.newMarkdownSha256)) {
    requireTransactionFile(fileSystem, nextMarkdown, journal.newMarkdownSha256);
    fileSystem.renameSync(nextMarkdown, finalMarkdown);
    syncPublicationDirectories(fileSystem, outputDirectory, transactionDirectory);
    afterMutation("markdown-published");
  }
  if (
    !fileHashEquals(fileSystem, finalJson, journal.newJsonSha256) ||
    !fileHashEquals(fileSystem, finalMarkdown, journal.newMarkdownSha256)
  ) {
    throw failure("REPORT_WRITE_FAILED", "Published report hashes do not match.");
  }
}

function recoverReportTransaction({ fileSystem = fs, outputDirectory }) {
  const transactionDirectory = path.join(
    outputDirectory,
    ".vmark-sync-transaction",
  );
  if (!fileSystem.existsSync(transactionDirectory)) return false;
  assertSafeTransactionDirectory(fileSystem, transactionDirectory);
  const journalPath = path.join(transactionDirectory, "journal.json");
  if (!fileSystem.existsSync(journalPath)) {
    removeIncompleteTransaction(fileSystem, transactionDirectory);
    return true;
  }

  let journal;
  try {
    journal = JSON.parse(fileSystem.readFileSync(journalPath, "utf8"));
  } catch (error) {
    throw failure("REPORT_WRITE_FAILED", "The report journal is malformed.", error);
  }
  if (!isValidReportJournal(journal)) {
    throw failure("REPORT_WRITE_FAILED", "The report journal shape is invalid.");
  }
  completeReportTransaction({
    fileSystem,
    journal,
    outputDirectory,
    transactionDirectory,
  });
  removeCompletedTransaction(fileSystem, transactionDirectory, outputDirectory);
  return true;
}

/**
 * Concurrent readers must use this helper. It honors the publication lock and
 * repairs any durable journal before returning a matching JSON/Markdown pair.
 */
function readPublishedReports({
  outputDirectory,
  fileSystem = fs,
  lockOptions = {},
}) {
  const lockDirectory = path.join(outputDirectory, ".vmark-sync-write.lock");
  const readerLock = acquireOwnershipLock(lockDirectory, {
    busyCode: "REPORT_WRITE_FAILED",
    fileSystem,
    invalidCode: "REPORT_WRITE_FAILED",
    purpose: "report-reader",
    ...lockOptions,
  });
  try {
    recoverReportTransaction({ fileSystem, outputDirectory });
    return {
      json: fileSystem.readFileSync(
        path.join(outputDirectory, "latest.json"),
        "utf8",
      ),
      markdown: fileSystem.readFileSync(
        path.join(outputDirectory, "latest.md"),
        "utf8",
      ),
    };
  } catch (error) {
    throw normalizeFailure(error, "REPORT_WRITE_FAILED");
  } finally {
    readerLock.release();
  }
}

function recoverPendingReportPublication({
  outputDirectory,
  fileSystem = fs,
  lockOptions = {},
}) {
  if (!fileSystem.existsSync(outputDirectory)) return false;
  const lockDirectory = path.join(outputDirectory, ".vmark-sync-write.lock");
  const recoveryLock = acquireOwnershipLock(lockDirectory, {
    busyCode: "REPORT_WRITE_FAILED",
    fileSystem,
    invalidCode: "REPORT_WRITE_FAILED",
    purpose: "report-recovery",
    ...lockOptions,
  });
  try {
    return recoverReportTransaction({ fileSystem, outputDirectory });
  } catch (error) {
    throw normalizeFailure(error, "REPORT_WRITE_FAILED");
  } finally {
    recoveryLock.release();
  }
}

function isValidReportJournal(journal) {
  return (
    journal &&
    journal.version === 1 &&
    /^[0-9a-f]{64}$/.test(journal.newJsonSha256) &&
    /^[0-9a-f]{64}$/.test(journal.newMarkdownSha256)
  );
}

function assertSafeTransactionDirectory(fileSystem, transactionDirectory) {
  try {
    const stat = fileSystem.lstatSync(transactionDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error("transaction is not a safe directory");
    }
    assertOwned(stat, "REPORT_WRITE_FAILED");
  } catch (error) {
    throw failure("REPORT_WRITE_FAILED", "The report transaction is unsafe.", error);
  }
}

function requireTransactionFile(fileSystem, filePath, expectedHash) {
  if (!fileHashEquals(fileSystem, filePath, expectedHash)) {
    throw failure("REPORT_WRITE_FAILED", "A journaled report file is missing or corrupt.");
  }
}

function fileHashEquals(fileSystem, filePath, expectedHash) {
  try {
    return sha256Text(fileSystem.readFileSync(filePath)).toString() === expectedHash;
  } catch {
    return false;
  }
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeDurableText(fileSystem, filePath, value, options) {
  const descriptor = fileSystem.openSync(
    filePath,
    options.flag || "w",
    options.mode || 0o600,
  );
  try {
    fileSystem.writeFileSync(descriptor, value, { encoding: "utf8" });
    fileSystem.fsyncSync(descriptor);
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

function syncDirectory(fileSystem, directory) {
  let descriptor;
  try {
    descriptor = fileSystem.openSync(directory, "r");
    fileSystem.fsyncSync(descriptor);
  } catch (error) {
    if (!["EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(error && error.code)) {
      throw error;
    }
  } finally {
    if (descriptor !== undefined) fileSystem.closeSync(descriptor);
  }
}

function syncPublicationDirectories(
  fileSystem,
  outputDirectory,
  transactionDirectory,
) {
  syncDirectory(fileSystem, transactionDirectory);
  syncDirectory(fileSystem, outputDirectory);
}

function removeIncompleteTransaction(fileSystem, transactionDirectory) {
  try {
    if (!fileSystem.existsSync(transactionDirectory)) return;
    assertSafeTransactionDirectory(fileSystem, transactionDirectory);
    fileSystem.rmSync(transactionDirectory, { recursive: true, force: true });
  } catch {
    // A pre-journal directory never mutates canonical reports; later recovery retries.
  }
}

function removeCompletedTransaction(
  fileSystem,
  transactionDirectory,
  outputDirectory,
) {
  assertSafeTransactionDirectory(fileSystem, transactionDirectory);
  fileSystem.rmSync(transactionDirectory, { recursive: true, force: true });
  syncDirectory(fileSystem, outputDirectory);
}

function main(argv = process.argv.slice(2), options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, "..");
  const stdout = options.stdout || process.stdout;
  const gitRunner = options.gitRunner || defaultGitRunner;
  const reportWriter = options.reportWriter || publishReportsWithRecovery;
  const { upstream } = parseArgs(argv);
  const manifestPath = path.join(
    projectRoot,
    "docs",
    "vmark-port",
    "manifest.json",
  );

  let manifest;
  try {
    manifest = validateManifest(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    );
  } catch (error) {
    throw normalizeFailure(error, "MANIFEST_INVALID");
  }

  const outputDirectory = path.join(projectRoot, "docs", "vmark-sync");
  recoverPendingReportPublication({
    outputDirectory,
    lockOptions: options.reportLockOptions,
  });

  const cacheDirectory = prepareUpstreamCache(manifest.upstream.repository, {
    cacheRoot: options.cacheRoot,
    gitRunner,
  });
  const { resolvedCommit, changes } = collectGitDiff({
    repository: cacheDirectory,
    baselineCommit: manifest.upstream.commit,
    upstream,
    gitRunner,
  });
  const reports = renderReports({
    manifest,
    resolvedCommit,
    changes,
    aurisRoot: projectRoot,
  });
  try {
    reportWriter({
      outputDirectory,
      reports,
      lockOptions: options.reportLockOptions,
    });
  } catch (error) {
    throw normalizeFailure(error, "REPORT_WRITE_FAILED");
  }
  stdout.write(
    `Compared ${manifest.upstream.commit} to ${resolvedCommit}; wrote docs/vmark-sync/latest.json and latest.md.\n`,
  );
  return { changes, reports, resolvedCommit };
}

function runCli(argv = process.argv.slice(2), options = {}) {
  const stderr = options.stderr || process.stderr;
  try {
    main(argv, options);
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    const normalized = normalizeFailure(error, "INTERNAL_ERROR");
    try {
      stderr.write(
        `VMark sync report failed [${normalized.code}]: ${normalized.publicMessage}\n`,
      );
    } catch {
      // There is no safe secondary output channel if stderr itself fails.
    }
    return normalized.exitCode;
  }
}

function runGitStep(gitRunner, argv, options) {
  try {
    return gitRunner(argv, options);
  } catch (error) {
    throw normalizeFailure(error, options.failureCode);
  }
}

function normalizeFailure(error, fallbackCode) {
  if (error instanceof SyncReportError) return error;
  if (
    error &&
    typeof error.code === "string" &&
    Object.hasOwn(EXIT_CODES, error.code)
  ) {
    return failure(error.code, PUBLIC_FAILURE_MESSAGES[error.code], error);
  }
  return failure(
    fallbackCode,
    PUBLIC_FAILURE_MESSAGES[fallbackCode] || PUBLIC_FAILURE_MESSAGES.INTERNAL_ERROR,
    error instanceof Error ? error : undefined,
  );
}

function manifestFailure(detail) {
  return failure("MANIFEST_INVALID", detail);
}

function assertPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw manifestFailure(`${label} must be an object.`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  const actualKeys = Object.keys(value);
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const extra = actualKeys.filter((key) => !expectedKeys.includes(key));
  if (missing.length > 0 || extra.length > 0) {
    throw manifestFailure(
      `${label} keys are invalid (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}).`,
    );
  }
}

function assertFullCommit(value, label, failureCode) {
  if (typeof value !== "string" || !FULL_COMMIT_PATTERN.test(value)) {
    throw failure(
      failureCode,
      `${label} must be a full 40-character hexadecimal commit.`,
    );
  }
}

function validatePathArray(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw manifestFailure(`${label} must be a non-empty array.`);
  }
  const localPaths = new Set();
  for (const value of values) {
    if (typeof value !== "string" || !PROJECT_PATH_PATTERN.test(value)) {
      throw manifestFailure(`${label} contains an invalid project path.`);
    }
    if (localPaths.has(value)) {
      const pathKind = label.endsWith("upstreamPaths")
        ? "upstream"
        : label.endsWith("aurisPaths")
          ? "Auris"
          : "test";
      throw manifestFailure(`duplicate ${pathKind} path: ${value}`);
    }
    localPaths.add(value);
  }
}

function validateStringArray(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw manifestFailure(`${label} must be a non-empty array.`);
  }
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string" || value.length === 0) {
      throw manifestFailure(`${label} must contain non-empty strings.`);
    }
    if (seen.has(value)) {
      throw manifestFailure(`${label} must contain unique values.`);
    }
    seen.add(value);
  }
}

function normalizeChange(change) {
  if (change === null || typeof change !== "object" || Array.isArray(change)) {
    throw failure("COMPARISON_FAILED", "A change record must be an object.");
  }
  if (!["changed", "added", "deleted", "renamed"].includes(change.status)) {
    throw failure("COMPARISON_FAILED", "A change record has an unsupported status.");
  }
  if (typeof change.path !== "string" || !PROJECT_PATH_PATTERN.test(change.path)) {
    throw failure("COMPARISON_FAILED", "A change path is invalid.");
  }
  if (change.status === "renamed") {
    if (
      typeof change.fromPath !== "string" ||
      !PROJECT_PATH_PATTERN.test(change.fromPath)
    ) {
      throw failure("COMPARISON_FAILED", "A renamed change requires a valid fromPath.");
    }
    return { fromPath: change.fromPath, path: change.path, status: change.status };
  }
  return { path: change.path, status: change.status };
}

function normalizeGitStatus(gitStatus) {
  if (gitStatus === "A") return "added";
  if (gitStatus === "D") return "deleted";
  if (["M", "T", "U"].includes(gitStatus)) return "changed";
  throw failure("COMPARISON_FAILED", "Git returned an unsupported diff status.");
}

function changeKey(change) {
  return `${change.status}\0${change.fromPath || ""}\0${change.path}`;
}

function mappedPathMatches(mappedPath, changedPath) {
  return changedPath === mappedPath || changedPath.startsWith(`${mappedPath}/`);
}

function sortChanges(changes) {
  return [...changes].sort((left, right) => {
    const byPath = compareText(left.path, right.path);
    if (byPath !== 0) return byPath;
    const byFromPath = compareText(left.fromPath || "", right.fromPath || "");
    if (byFromPath !== 0) return byFromPath;
    return compareText(left.status, right.status);
  });
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

module.exports = {
  EXIT_CODES,
  SyncReportError,
  acquireOwnershipLock,
  collectGitDiff,
  createGitRunner,
  createProcessStartIdentityProvider,
  defaultIsProcessAlive,
  main,
  parseArgs,
  prepareUpstreamCache,
  publishReportsWithRecovery,
  readPublishedReports,
  renderReports,
  resolveCachePaths,
  runCli,
  validateManifest,
};

if (require.main === module) {
  process.exitCode = runCli();
}
