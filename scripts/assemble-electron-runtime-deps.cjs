#!/usr/bin/env node
/**
 * Assemble the audited Electron/MCP production dependency closure into
 * generated `electron/node_modules`, and write a stable inventory to
 * `electron/runtime-dependencies.json`.
 *
 * Roots are allowlisted. Resolution uses installed package metadata and
 * Node's ancestor `node_modules` walk (no shell). Path/symlink escapes are
 * refused. Cleanup is limited to generated `electron/node_modules`.
 */
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const AUDITED_ROOTS = Object.freeze([
  "@modelcontextprotocol/sdk",
  // 自动更新：main.cjs 通过 electron/updates/app-updater.cjs 懒加载它。
  // electron-builder.yml 里 node_modules 默认被排除，只有进入这份审计闭包
  // （落到 electron/node_modules）才会被打包，否则打包后 require 直接抛错。
  "electron-updater",
  "jsdom",
  "proper-lockfile",
  "smol-toml",
  "ws",
  "yaml",
  "zod",
]);

const SCHEMA_VERSION = 1;
const INVENTORY_FILE_NAME = "runtime-dependencies.json";
const GENERATED_NODE_MODULES = path.join("electron", "node_modules");

const SIDECAR_ENTRY = path.join("electron", "auris-notes-mcp-server.mjs");
const BROWSER_CONTRACT_ENTRY = path.join(
  "electron",
  "shared",
  "browser-contract.cjs",
);

class RuntimeDepsError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "RuntimeDepsError";
    this.code = code;
  }
}

/**
 * @param {string} projectRoot
 */
function resolveProjectPaths(projectRoot, outputDirectory) {
  const root = path.resolve(projectRoot);
  const defaultElectronDir = path.join(root, "electron");
  const electronDir = outputDirectory
    ? path.resolve(outputDirectory)
    : defaultElectronDir;
  if (
    electronDir !== defaultElectronDir &&
    !electronDir.startsWith(defaultElectronDir + path.sep)
  ) {
    throw new RuntimeDepsError(
      "PATH_ESCAPE",
      `Runtime dependency output must stay within ${defaultElectronDir}`,
    );
  }
  return {
    projectRoot: root,
    nodeModulesRoot: path.join(root, "node_modules"),
    electronDir,
    electronNodeModules: path.join(electronDir, "node_modules"),
    inventoryPath: path.join(electronDir, INVENTORY_FILE_NAME),
  };
}

/**
 * @param {string} candidate
 * @param {string} boundary
 */
function assertWithinBoundary(candidate, boundary) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedBoundary = path.resolve(boundary);
  if (
    resolvedCandidate !== resolvedBoundary &&
    !resolvedCandidate.startsWith(resolvedBoundary + path.sep)
  ) {
    throw new RuntimeDepsError(
      "PATH_ESCAPE",
      `Path escapes allowed boundary: ${resolvedCandidate}`,
    );
  }
  return resolvedCandidate;
}

/**
 * @param {string} targetPath
 * @param {string} boundary
 */
function assertRealpathWithinBoundary(targetPath, boundary) {
  assertWithinBoundary(targetPath, boundary);
  let realTarget;
  let realBoundary;
  try {
    realTarget = fs.realpathSync(targetPath);
    realBoundary = fs.realpathSync(boundary);
  } catch (error) {
    throw new RuntimeDepsError(
      "PATH_ESCAPE",
      `Unable to resolve real path for ${targetPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (
    realTarget !== realBoundary &&
    !realTarget.startsWith(realBoundary + path.sep)
  ) {
    throw new RuntimeDepsError(
      "PATH_ESCAPE",
      `Symlink/realpath escapes allowed boundary: ${targetPath} -> ${realTarget}`,
    );
  }
  return realTarget;
}

/**
 * Resolve a package directory the same way Node walks ancestor node_modules.
 * @param {string} packageName
 * @param {string} fromDir
 * @returns {string | null}
 */
function resolvePackageDirectory(packageName, fromDir) {
  if (!packageName || packageName.startsWith(".") || packageName.startsWith("/")) {
    throw new RuntimeDepsError(
      "INVALID_PACKAGE_NAME",
      `Invalid package name: ${packageName}`,
    );
  }

  const segments = packageName.startsWith("@")
    ? packageName.split("/")
    : [packageName];
  if (
    packageName.startsWith("@") &&
    (segments.length !== 2 || !segments[0] || !segments[1])
  ) {
    throw new RuntimeDepsError(
      "INVALID_PACKAGE_NAME",
      `Invalid scoped package name: ${packageName}`,
    );
  }

  let current = path.resolve(fromDir);
  while (true) {
    const candidate = path.join(current, "node_modules", ...segments);
    // Never resolve from the generated electron/node_modules tree — that output
    // is a copy destination, not an authoritative install source.
    const normalized = candidate.split(path.sep).join("/");
    if (
      !normalized.includes("/electron/node_modules/")
      && fs.existsSync(path.join(candidate, "package.json"))
    ) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * @param {string} packageDir
 */
function readPackageJson(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw new RuntimeDepsError(
      "INVALID_PACKAGE_JSON",
      `Unable to read package.json at ${packageJsonPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {string[]} [options.roots]
 * @param {string} [options.resolveFrom]
 */
function buildDependencyClosure({
  projectRoot,
  roots = AUDITED_ROOTS,
  resolveFrom,
} = {}) {
  const paths = resolveProjectPaths(projectRoot);
  const fromDir = path.resolve(resolveFrom ?? paths.projectRoot);
  assertWithinBoundary(fromDir, paths.projectRoot);

  if (!fs.existsSync(paths.nodeModulesRoot)) {
    throw new RuntimeDepsError(
      "MISSING_NODE_MODULES",
      `Project node_modules not found at ${paths.nodeModulesRoot}`,
    );
  }

  /** @type {Map<string, {
   *   name: string,
   *   version: string,
   *   packageDir: string,
   *   realDir: string,
   *   relativePath: string,
   *   kind: "root" | "dependency" | "optional",
   *   requiredBy: Set<string>,
   *   os?: string[] | string,
   *   cpu?: string[] | string,
   * }>} */
  const packages = new Map();
  /** @type {Array<{ name: string, requiredBy: string }>} */
  const unresolvedOptionalDependencies = [];
  /** @type {Array<{ name: string, fromDir: string, requiredBy: string, optional: boolean }>} */
  const queue = [];

  for (const rootName of roots) {
    queue.push({
      name: rootName,
      fromDir,
      requiredBy: "electron/*",
      optional: false,
    });
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      break;
    }

    const packageDir = resolvePackageDirectory(item.name, item.fromDir);
    if (!packageDir) {
      if (item.optional) {
        unresolvedOptionalDependencies.push({
          name: item.name,
          requiredBy: item.requiredBy,
        });
        continue;
      }
      throw new RuntimeDepsError(
        "MISSING_DEPENDENCY",
        `Missing dependency ${item.name} required by ${item.requiredBy}`,
      );
    }

    assertWithinBoundary(packageDir, paths.projectRoot);
    const realDir = assertRealpathWithinBoundary(
      packageDir,
      paths.nodeModulesRoot,
    );

    const pkg = readPackageJson(packageDir);
    const name = typeof pkg.name === "string" && pkg.name ? pkg.name : item.name;
    const version =
      typeof pkg.version === "string" && pkg.version ? pkg.version : "0.0.0";
    const relativePath = path
      .relative(paths.projectRoot, packageDir)
      .split(path.sep)
      .join("/");

    let record = packages.get(realDir);
    if (!record) {
      const kind =
        item.requiredBy === "electron/*"
          ? "root"
          : item.optional
            ? "optional"
            : "dependency";
      record = {
        name,
        version,
        packageDir,
        realDir,
        relativePath,
        kind,
        requiredBy: new Set(),
        os: pkg.os,
        cpu: pkg.cpu,
      };
      packages.set(realDir, record);

      const productionDeps = Object.keys(pkg.dependencies || {});
      for (const depName of productionDeps) {
        queue.push({
          name: depName,
          fromDir: packageDir,
          requiredBy: name,
          optional: false,
        });
      }

      const optionalDeps = Object.keys(pkg.optionalDependencies || {});
      for (const depName of optionalDeps) {
        queue.push({
          name: depName,
          fromDir: packageDir,
          requiredBy: name,
          optional: true,
        });
      }
    } else if (record.kind !== "root") {
      if (!item.optional && record.kind === "optional") {
        record.kind = "dependency";
      }
    }

    record.requiredBy.add(item.requiredBy);
  }

  unresolvedOptionalDependencies.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.requiredBy.localeCompare(b.requiredBy);
  });

  return {
    roots: [...roots],
    packages: [...packages.values()].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    ),
    unresolvedOptionalDependencies,
  };
}

/**
 * @param {ReturnType<typeof buildDependencyClosure>} closure
 */
function computeInventory(closure) {
  return {
    schemaVersion: SCHEMA_VERSION,
    roots: [...closure.roots].sort((a, b) => a.localeCompare(b)),
    packages: closure.packages.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      path: pkg.relativePath,
      kind: pkg.kind,
      requiredBy: [...pkg.requiredBy].sort((a, b) => a.localeCompare(b)),
      ...(pkg.os !== undefined ? { os: pkg.os } : {}),
      ...(pkg.cpu !== undefined ? { cpu: pkg.cpu } : {}),
    })),
    unresolvedOptionalDependencies: closure.unresolvedOptionalDependencies.map(
      (entry) => ({
        name: entry.name,
        requiredBy: entry.requiredBy,
      }),
    ),
  };
}

/**
 * @param {ReturnType<typeof computeInventory>} inventory
 */
function serializeManifest(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

/**
 * @param {string} inventoryPath
 * @param {ReturnType<typeof computeInventory>} inventory
 */
function writeManifest(inventoryPath, inventory) {
  const directory = path.dirname(inventoryPath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(inventoryPath, serializeManifest(inventory), "utf8");
}

/**
 * Remove only generated `electron/node_modules` under the project root.
 * @param {string} projectRoot
 */
function cleanElectronNodeModules(projectRoot) {
  const paths = resolveProjectPaths(projectRoot);
  const target = paths.electronNodeModules;
  const expected = path.join(paths.projectRoot, GENERATED_NODE_MODULES);

  if (path.resolve(target) !== path.resolve(expected)) {
    throw new RuntimeDepsError(
      "CLEANUP_REFUSED",
      `Cleanup refused: unexpected target ${target}`,
    );
  }

  assertWithinBoundary(target, paths.electronDir);

  if (!fs.existsSync(target)) {
    return { removed: false, target };
  }

  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    throw new RuntimeDepsError(
      "CLEANUP_REFUSED",
      `Cleanup refused: ${target} is a symlink`,
    );
  }

  assertRealpathWithinBoundary(target, paths.electronDir);
  fs.rmSync(target, { recursive: true, force: false });
  return { removed: true, target };
}

/**
 * @param {string} source
 * @param {string} destination
 */
function copyPackageDirectory(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    dereference: false,
    filter: (src) => {
      if (fs.lstatSync(src).isSymbolicLink()) {
        throw new RuntimeDepsError(
          "PATH_ESCAPE",
          `Refusing symlink inside runtime dependency: ${src}`,
        );
      }
      const base = path.basename(src);
      return base !== ".bin";
    },
  });
}

/**
 * @param {ReturnType<typeof buildDependencyClosure>["packages"]} packages
 */
function selectTopLevelCopyPackages(packages) {
  return packages.filter((pkg) => {
    return !packages.some(
      (other) =>
        other.realDir !== pkg.realDir &&
        pkg.realDir.startsWith(other.realDir + path.sep),
    );
  });
}

/**
 * @param {string} projectRoot
 * @param {ReturnType<typeof buildDependencyClosure>} closure
 */
function copyClosureToDirectory(paths, closure, destinationRoot) {
  fs.mkdirSync(destinationRoot, { recursive: true });
  assertRealpathWithinBoundary(destinationRoot, paths.electronDir);

  const topLevel = selectTopLevelCopyPackages(closure.packages);
  /** @type {string[]} */
  const copied = [];

  for (const pkg of topLevel) {
    assertRealpathWithinBoundary(pkg.packageDir, paths.nodeModulesRoot);
    const relativeUnderNodeModules = path.relative(
      paths.nodeModulesRoot,
      pkg.packageDir,
    );
    if (
      relativeUnderNodeModules.startsWith("..") ||
      path.isAbsolute(relativeUnderNodeModules)
    ) {
      throw new RuntimeDepsError(
        "PATH_ESCAPE",
        `Package path escapes node_modules: ${pkg.packageDir}`,
      );
    }

    const destination = path.join(
      destinationRoot,
      relativeUnderNodeModules,
    );
    assertWithinBoundary(destination, destinationRoot);
    copyPackageDirectory(pkg.packageDir, destination);
    copied.push(pkg.relativePath);
  }

  for (const pkg of closure.packages) {
    const relativeUnderNodeModules = path.relative(
      paths.nodeModulesRoot,
      pkg.packageDir,
    );
    const destinationPackageJson = path.join(
      destinationRoot,
      relativeUnderNodeModules,
      "package.json",
    );
    if (!fs.existsSync(destinationPackageJson)) {
      throw new RuntimeDepsError(
        "COPY_INCOMPLETE",
        `Missing packaged package.json for ${pkg.relativePath}`,
      );
    }
  }

  return { copied: copied.sort((a, b) => a.localeCompare(b)) };
}

/**
 * Build the closure away from the live resolver path, then swap it into place.
 * Tests and the development app may resolve packages concurrently with a
 * release assembly; they must see either the previous complete closure or the
 * next complete closure, never a partially copied tree.
 * @param {string} projectRoot
 * @param {ReturnType<typeof buildDependencyClosure>} closure
 */
function copyClosureToElectron(projectRoot, closure, outputDirectory) {
  const paths = resolveProjectPaths(projectRoot, outputDirectory);
  fs.mkdirSync(paths.electronDir, { recursive: true });
  const staging = fs.mkdtempSync(
    path.join(paths.electronDir, ".runtime-node-modules-stage-"),
  );
  const backup = path.join(
    paths.electronDir,
    `.runtime-node-modules-backup-${process.pid}-${Date.now()}`,
  );
  let previousMoved = false;

  try {
    const copyResult = copyClosureToDirectory(paths, closure, staging);

    if (fs.existsSync(paths.electronNodeModules)) {
      const stat = fs.lstatSync(paths.electronNodeModules);
      if (stat.isSymbolicLink()) {
        throw new RuntimeDepsError(
          "CLEANUP_REFUSED",
          `Replacement refused: ${paths.electronNodeModules} is a symlink`,
        );
      }
      assertRealpathWithinBoundary(
        paths.electronNodeModules,
        paths.electronDir,
      );
      fs.renameSync(paths.electronNodeModules, backup);
      previousMoved = true;
    }

    try {
      fs.renameSync(staging, paths.electronNodeModules);
    } catch (error) {
      if (previousMoved && !fs.existsSync(paths.electronNodeModules)) {
        fs.renameSync(backup, paths.electronNodeModules);
        previousMoved = false;
      }
      throw error;
    }

    if (previousMoved) {
      fs.rmSync(backup, { recursive: true, force: false });
      previousMoved = false;
    }
    return copyResult;
  } finally {
    if (fs.existsSync(staging)) {
      fs.rmSync(staging, { recursive: true, force: false });
    }
    if (previousMoved && fs.existsSync(backup)) {
      if (!fs.existsSync(paths.electronNodeModules)) {
        fs.renameSync(backup, paths.electronNodeModules);
      } else {
        fs.rmSync(backup, { recursive: true, force: false });
      }
    }
  }
}

/**
 * Extract bare package names from JS/CJS/MJS source.
 * @param {string} source
 * @returns {string[]}
 */
function extractBarePackageNames(source) {
  /** @type {Set<string>} */
  const names = new Set();
  const patterns = [
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      const specifier = match[1];
      match = pattern.exec(source);
      if (
        !specifier ||
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        specifier.startsWith("node:")
      ) {
        continue;
      }
      if (specifier.startsWith("@")) {
        const parts = specifier.split("/");
        if (parts.length >= 2) {
          names.add(`${parts[0]}/${parts[1]}`);
        }
        continue;
      }
      names.add(specifier.split("/")[0]);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string[]} filePaths
 */
function collectRequiredPackages(filePaths) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const filePath of filePaths) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const name of extractBarePackageNames(source)) {
      names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Smoke-import audited roots + browser contract from staged electron/.
 * Uses spawnSync with shell:false and clears NODE_PATH.
 * @param {string} projectRoot
 */
function runSmokeImportCheck(projectRoot, outputDirectory) {
  const paths = resolveProjectPaths(projectRoot, outputDirectory);
  if (!fs.existsSync(paths.electronNodeModules)) {
    throw new RuntimeDepsError(
      "SMOKE_FAILED",
      "electron/node_modules is missing; run the assembler first",
    );
  }

  const script = `
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const electronDir = process.cwd();
async function main() {
  await import("@modelcontextprotocol/sdk/server/mcp.js");
  await import("ws");
  await import("zod");
  await import("yaml");
  require(path.join(electronDir, "shared", "browser-contract.cjs"));
  console.log("ok");
}
main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
`;

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: paths.electronDir,
    env: {
      ...process.env,
      NODE_PATH: "",
      NODE_OPTIONS: "",
    },
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    throw new RuntimeDepsError(
      "SMOKE_FAILED",
      `Smoke import failed:\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }

  return {
    ok: true,
    stdout: (result.stdout || "").trim(),
  };
}

/**
 * @param {object} [options]
 * @param {string} [options.projectRoot]
 * @param {string[]} [options.roots]
 * @param {boolean} [options.smoke]
 * @param {boolean} [options.writeInventory]
 * @param {string} [options.outputDirectory]
 */
function assembleElectronRuntimeDeps({
  projectRoot = path.resolve(__dirname, ".."),
  roots = AUDITED_ROOTS,
  smoke = true,
  writeInventory = true,
  outputDirectory,
} = {}) {
  const paths = resolveProjectPaths(projectRoot, outputDirectory);
  const closure = buildDependencyClosure({
    projectRoot: paths.projectRoot,
    roots,
    resolveFrom: paths.nodeModulesRoot,
  });
  const inventory = computeInventory(closure);

  const copyResult = copyClosureToElectron(
    paths.projectRoot,
    closure,
    paths.electronDir,
  );

  if (writeInventory) {
    writeManifest(paths.inventoryPath, inventory);
  }

  let smokeResult = null;
  if (smoke) {
    smokeResult = runSmokeImportCheck(paths.projectRoot, paths.electronDir);
  }

  return {
    inventory,
    inventoryPath: paths.inventoryPath,
    electronNodeModules: paths.electronNodeModules,
    copied: copyResult.copied,
    packageCount: closure.packages.length,
    smoke: smokeResult,
  };
}

/**
 * Dry-run helpers for tests: resolve closure without mutating electron/.
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {string[]} [options.roots]
 * @param {string[]} [options.entryFiles]
 */
function dryRunPackagedRoots({
  projectRoot,
  roots = AUDITED_ROOTS,
  entryFiles,
} = {}) {
  const paths = resolveProjectPaths(projectRoot);
  const closure = buildDependencyClosure({
    projectRoot: paths.projectRoot,
    roots,
    resolveFrom: paths.projectRoot,
  });
  const inventory = computeInventory(closure);
  const entries =
    entryFiles ??
    [SIDECAR_ENTRY, BROWSER_CONTRACT_ENTRY].map((relative) =>
      path.join(paths.projectRoot, relative),
    );
  const requiredPackages = collectRequiredPackages(entries);
  const packagedNames = new Set(inventory.packages.map((pkg) => pkg.name));
  const missing = requiredPackages.filter((name) => !packagedNames.has(name));

  return {
    inventory,
    requiredPackages,
    missing,
    packageNames: [...packagedNames].sort((a, b) => a.localeCompare(b)),
  };
}

function main(argv = process.argv.slice(2)) {
  const projectRoot = path.resolve(__dirname, "..");
  const skipSmoke = argv.includes("--no-smoke");

  try {
    const result = assembleElectronRuntimeDeps({
      projectRoot,
      smoke: !skipSmoke,
    });
    console.log(
      `[assemble-electron-runtime-deps] packaged ${result.packageCount} packages into ${path.relative(
        projectRoot,
        result.electronNodeModules,
      )}`,
    );
    console.log(
      `[assemble-electron-runtime-deps] wrote ${path.relative(
        projectRoot,
        result.inventoryPath,
      )}`,
    );
    if (result.smoke) {
      console.log("[assemble-electron-runtime-deps] smoke import ok");
    }
    return 0;
  } catch (error) {
    const message =
      error instanceof RuntimeDepsError
        ? `[assemble-electron-runtime-deps] ${error.code}: ${error.message}`
        : `[assemble-electron-runtime-deps] ${
            error instanceof Error ? error.stack || error.message : String(error)
          }`;
    console.error(message);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  AUDITED_ROOTS,
  SCHEMA_VERSION,
  SIDECAR_ENTRY,
  BROWSER_CONTRACT_ENTRY,
  RuntimeDepsError,
  resolvePackageDirectory,
  buildDependencyClosure,
  computeInventory,
  serializeManifest,
  writeManifest,
  cleanElectronNodeModules,
  copyClosureToElectron,
  selectTopLevelCopyPackages,
  extractBarePackageNames,
  collectRequiredPackages,
  runSmokeImportCheck,
  assembleElectronRuntimeDeps,
  dryRunPackagedRoots,
  main,
};
