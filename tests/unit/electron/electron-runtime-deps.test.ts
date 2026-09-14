import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const assembler =
  require("../../../scripts/assemble-electron-runtime-deps.cjs") as {
    AUDITED_ROOTS: string[];
    RuntimeDepsError: new (
      code: string,
      message: string,
    ) => Error & {
      code: string;
    };
    resolvePackageDirectory: (name: string, fromDir: string) => string | null;
    buildDependencyClosure: (options: {
      projectRoot: string;
      roots?: string[];
      resolveFrom?: string;
    }) => {
      roots: string[];
      packages: Array<{
        name: string;
        version: string;
        packageDir: string;
        realDir: string;
        relativePath: string;
        kind: string;
        requiredBy: Set<string>;
      }>;
      unresolvedOptionalDependencies: Array<{
        name: string;
        requiredBy: string;
      }>;
    };
    computeInventory: (closure: unknown) => {
      schemaVersion: number;
      roots: string[];
      packages: Array<{
        name: string;
        version: string;
        path: string;
        kind: string;
        requiredBy: string[];
      }>;
      unresolvedOptionalDependencies: Array<{
        name: string;
        requiredBy: string;
      }>;
    };
    serializeManifest: (inventory: unknown) => string;
    cleanElectronNodeModules: (projectRoot: string) => {
      removed: boolean;
      target: string;
    };
    copyClosureToElectron: (
      projectRoot: string,
      closure: unknown,
    ) => { copied: string[] };
    assembleElectronRuntimeDeps: (options: {
      projectRoot: string;
      roots?: string[];
      smoke?: boolean;
      writeInventory?: boolean;
      outputDirectory?: string;
    }) => {
      inventory: { packages: Array<{ name: string; path: string }> };
      packageCount: number;
      electronNodeModules: string;
      inventoryPath: string;
    };
    dryRunPackagedRoots: (options: {
      projectRoot: string;
      roots?: string[];
      entryFiles?: string[];
    }) => {
      inventory: {
        packages: Array<{ name: string; path: string; kind: string }>;
        roots: string[];
      };
      requiredPackages: string[];
      missing: string[];
      packageNames: string[];
    };
    extractBarePackageNames: (source: string) => string[];
  };

const {
  AUDITED_ROOTS,
  RuntimeDepsError,
  resolvePackageDirectory,
  buildDependencyClosure,
  computeInventory,
  serializeManifest,
  cleanElectronNodeModules,
  copyClosureToElectron,
  assembleElectronRuntimeDeps,
  dryRunPackagedRoots,
  extractBarePackageNames,
} = assembler;

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

function makeTempProject(prefix = "auris-runtime-deps-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "electron"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
  return root;
}

function writePackage(
  projectRoot: string,
  relativePackageDir: string,
  packageJson: Record<string, unknown>,
  files: Record<string, string> = {},
) {
  const packageDir = path.join(projectRoot, relativePackageDir);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(packageDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents, "utf8");
  }
  return packageDir;
}

describe("assemble-electron-runtime-deps fixtures", () => {
  it("resolves scoped packages through ancestor node_modules", () => {
    const root = makeTempProject();
    writePackage(root, "node_modules/@scope/pkg", {
      name: "@scope/pkg",
      version: "1.0.0",
      dependencies: {},
    });

    const resolved = resolvePackageDirectory(
      "@scope/pkg",
      path.join(root, "electron"),
    );
    expect(resolved).toBe(path.join(root, "node_modules/@scope/pkg"));
  });

  it("includes present optional/platform packages and skips missing optional deps", () => {
    const root = makeTempProject();
    writePackage(root, "node_modules/root-pkg", {
      name: "root-pkg",
      version: "1.0.0",
      dependencies: {},
      optionalDependencies: {
        "platform-helper": "^1.0.0",
        "missing-optional": "^1.0.0",
      },
    });
    writePackage(root, "node_modules/platform-helper", {
      name: "platform-helper",
      version: "1.2.3",
      os: ["darwin"],
      cpu: ["arm64"],
      dependencies: {},
    });

    const closure = buildDependencyClosure({
      projectRoot: root,
      roots: ["root-pkg"],
      resolveFrom: path.join(root, "electron"),
    });

    expect(closure.packages.map((pkg) => pkg.name).sort()).toEqual([
      "platform-helper",
      "root-pkg",
    ]);
    expect(closure.unresolvedOptionalDependencies).toEqual([
      { name: "missing-optional", requiredBy: "root-pkg" },
    ]);
    const platform = closure.packages.find(
      (pkg) => pkg.name === "platform-helper",
    );
    expect(platform?.kind).toBe("optional");
  });

  it("keeps duplicate versions when nested node_modules pin a different copy", () => {
    const root = makeTempProject();
    writePackage(root, "node_modules/parent", {
      name: "parent",
      version: "1.0.0",
      dependencies: {
        shared: "^2.0.0",
      },
    });
    writePackage(root, "node_modules/shared", {
      name: "shared",
      version: "1.0.0",
      dependencies: {},
    });
    writePackage(root, "node_modules/parent/node_modules/shared", {
      name: "shared",
      version: "2.0.0",
      dependencies: {},
    });

    const closure = buildDependencyClosure({
      projectRoot: root,
      roots: ["parent", "shared"],
      resolveFrom: path.join(root, "electron"),
    });

    const shared = closure.packages.filter((pkg) => pkg.name === "shared");
    expect(shared).toHaveLength(2);
    expect(shared.map((pkg) => pkg.version).sort()).toEqual(["1.0.0", "2.0.0"]);
  });

  it("fails on missing required dependency", () => {
    const root = makeTempProject();
    writePackage(root, "node_modules/broken", {
      name: "broken",
      version: "1.0.0",
      dependencies: {
        "does-not-exist": "^1.0.0",
      },
    });

    expect(() =>
      buildDependencyClosure({
        projectRoot: root,
        roots: ["broken"],
        resolveFrom: path.join(root, "electron"),
      }),
    ).toThrowError(RuntimeDepsError);

    try {
      buildDependencyClosure({
        projectRoot: root,
        roots: ["broken"],
        resolveFrom: path.join(root, "electron"),
      });
      throw new Error("expected missing dependency to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeDepsError);
      expect((error as { code: string }).code).toBe("MISSING_DEPENDENCY");
    }
  });

  it("refuses symlink/path escape outside project node_modules", () => {
    const root = makeTempProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "auris-outside-"));
    tempRoots.push(outside);
    writePackage(outside, "evil-pkg", {
      name: "evil-pkg",
      version: "1.0.0",
      dependencies: {},
    });
    writePackage(root, "node_modules/root-pkg", {
      name: "root-pkg",
      version: "1.0.0",
      dependencies: {
        "evil-pkg": "^1.0.0",
      },
    });

    const linkPath = path.join(root, "node_modules", "evil-pkg");
    fs.symlinkSync(path.join(outside, "evil-pkg"), linkPath, "dir");

    expect(() =>
      buildDependencyClosure({
        projectRoot: root,
        roots: ["root-pkg"],
        resolveFrom: path.join(root, "electron"),
      }),
    ).toThrowError(RuntimeDepsError);

    try {
      buildDependencyClosure({
        projectRoot: root,
        roots: ["root-pkg"],
        resolveFrom: path.join(root, "electron"),
      });
      throw new Error("expected path escape to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeDepsError);
      expect((error as { code: string }).code).toBe("PATH_ESCAPE");
    }
  });

  it("refuses symlinks nested inside a package before copying", () => {
    const root = makeTempProject();
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "auris-package-link-"),
    );
    tempRoots.push(outside);
    fs.writeFileSync(
      path.join(outside, "secret.txt"),
      "must not be packaged\n",
      "utf8",
    );
    const packageDir = writePackage(
      root,
      "node_modules/linked-pkg",
      {
        name: "linked-pkg",
        version: "1.0.0",
        dependencies: {},
      },
      { "index.js": "module.exports = true;\n" },
    );
    fs.symlinkSync(
      path.join(outside, "secret.txt"),
      path.join(packageDir, "escaped-secret.txt"),
    );

    const closure = buildDependencyClosure({
      projectRoot: root,
      roots: ["linked-pkg"],
      resolveFrom: root,
    });

    expect(() => copyClosureToElectron(root, closure)).toThrowError(
      RuntimeDepsError,
    );
    expect(
      fs.existsSync(
        path.join(root, "electron/node_modules/linked-pkg/escaped-secret.txt"),
      ),
    ).toBe(false);
  });

  it("writes a stable inventory manifest across repeated runs", () => {
    const root = makeTempProject();
    writePackage(
      root,
      "node_modules/@scope/alpha",
      {
        name: "@scope/alpha",
        version: "1.0.0",
        dependencies: {
          beta: "^1.0.0",
        },
      },
      { "index.js": "module.exports = 'alpha';\n" },
    );
    writePackage(
      root,
      "node_modules/beta",
      {
        name: "beta",
        version: "1.0.0",
        dependencies: {},
      },
      { "index.js": "module.exports = 'beta';\n" },
    );

    const first = assembleElectronRuntimeDeps({
      projectRoot: root,
      roots: ["@scope/alpha"],
      smoke: false,
    });
    const firstText = fs.readFileSync(first.inventoryPath, "utf8");

    const second = assembleElectronRuntimeDeps({
      projectRoot: root,
      roots: ["@scope/alpha"],
      smoke: false,
    });
    const secondText = fs.readFileSync(second.inventoryPath, "utf8");

    expect(secondText).toBe(firstText);
    expect(
      serializeManifest(
        computeInventory(
          buildDependencyClosure({
            projectRoot: root,
            roots: ["@scope/alpha"],
            resolveFrom: root,
          }),
        ),
      ),
    ).toBe(firstText);
  });

  it("limits cleanup to generated electron/node_modules and preserves other electron files", () => {
    const root = makeTempProject();
    writePackage(
      root,
      "node_modules/keep",
      {
        name: "keep",
        version: "1.0.0",
        dependencies: {},
      },
      { "index.js": "module.exports = 1;\n" },
    );

    const sentinel = path.join(root, "electron", "sentinel.cjs");
    fs.writeFileSync(sentinel, "module.exports = 'safe';\n", "utf8");

    assembleElectronRuntimeDeps({
      projectRoot: root,
      roots: ["keep"],
      smoke: false,
    });

    expect(
      fs.existsSync(path.join(root, "electron", "node_modules", "keep")),
    ).toBe(true);

    const cleanup = cleanElectronNodeModules(root);
    expect(cleanup.removed).toBe(true);
    expect(fs.existsSync(path.join(root, "electron", "node_modules"))).toBe(
      false,
    );
    expect(fs.readFileSync(sentinel, "utf8")).toContain("safe");
    expect(fs.existsSync(path.join(root, "node_modules", "keep"))).toBe(true);
  });

  it("refuses cleanup when electron/node_modules is a symlink", () => {
    const root = makeTempProject();
    const decoy = fs.mkdtempSync(path.join(os.tmpdir(), "auris-decoy-"));
    tempRoots.push(decoy);
    fs.writeFileSync(path.join(decoy, "trap.txt"), "nope\n", "utf8");
    fs.symlinkSync(decoy, path.join(root, "electron", "node_modules"), "dir");

    expect(() => cleanElectronNodeModules(root)).toThrowError(RuntimeDepsError);
    expect(fs.existsSync(path.join(decoy, "trap.txt"))).toBe(true);
  });
});

describe("assemble-electron-runtime-deps real dry-run", () => {
  it("packages audited roots with transitive deps for the MCP stdio sidecar and browser-contract", () => {
    const dryRun = dryRunPackagedRoots({
      projectRoot: PROJECT_ROOT,
      roots: AUDITED_ROOTS,
      entryFiles: [
        path.join(PROJECT_ROOT, "electron/auris-notes-mcp-server.mjs"),
        path.join(PROJECT_ROOT, "electron/shared/browser-contract.cjs"),
        path.join(PROJECT_ROOT, "electron/shared/nia-definition-contract.cjs"),
        path.join(PROJECT_ROOT, "electron/shared/nia-workflow-contract.cjs"),
        path.join(
          PROJECT_ROOT,
          "electron/shared/browser-workflow-contract.cjs",
        ),
      ],
    });

    expect(dryRun.inventory.roots).toEqual([...AUDITED_ROOTS].sort());
    expect(dryRun.requiredPackages).toEqual([
      "@modelcontextprotocol/sdk",
      "ws",
      "yaml",
      "zod",
    ]);
    expect(dryRun.missing).toEqual([]);

    for (const rootName of AUDITED_ROOTS) {
      expect(dryRun.packageNames).toContain(rootName);
    }

    // Transitive production deps of the MCP SDK must be present.
    expect(dryRun.packageNames).toContain("express");
    expect(dryRun.packageNames).toContain("hono");
    expect(dryRun.packageNames).toContain("ajv");
    expect(dryRun.packageNames).toContain("zod-to-json-schema");

    const projectPackageJson = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"),
    ) as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    const productionNames = new Set(
      Object.keys(projectPackageJson.dependencies ?? {}),
    );
    const arbitraryDevDeps = Object.keys(
      projectPackageJson.devDependencies ?? {},
    ).filter((name) => !productionNames.has(name));

    for (const name of [
      "vitest",
      "eslint",
      "typescript",
      "electron",
      "electron-builder",
      "@playwright/test",
      "playwright",
    ]) {
      expect(arbitraryDevDeps).toContain(name);
      expect(dryRun.packageNames).not.toContain(name);
    }

    for (const contract of [
      "nia-definition-contract.cjs",
      "nia-workflow-contract.cjs",
      "browser-workflow-contract.cjs",
    ]) {
      expect(
        fs.existsSync(path.join(PROJECT_ROOT, "electron/shared", contract)),
      ).toBe(true);
    }

    expect(
      extractBarePackageNames(
        fs.readFileSync(
          path.join(PROJECT_ROOT, "electron/auris-notes-mcp-server.mjs"),
          "utf8",
        ),
      ),
    ).toEqual(["@modelcontextprotocol/sdk", "ws", "zod"]);
  });

  it("copies the real closure into electron/node_modules and keeps inventory stable", () => {
    const outputDirectory = fs.mkdtempSync(
      path.join(PROJECT_ROOT, "electron", ".runtime-deps-test-"),
    );
    tempRoots.push(outputDirectory);
    const first = assembleElectronRuntimeDeps({
      outputDirectory,
      projectRoot: PROJECT_ROOT,
      roots: AUDITED_ROOTS,
      smoke: false,
    });
    const firstText = fs.readFileSync(first.inventoryPath, "utf8");

    expect(first.packageCount).toBeGreaterThan(AUDITED_ROOTS.length);
    for (const rootName of AUDITED_ROOTS) {
      const packagePath = path.join(
        first.electronNodeModules,
        ...rootName.split("/"),
        "package.json",
      );
      expect(fs.existsSync(packagePath)).toBe(true);
    }

    const nestedAjv = path.join(
      first.electronNodeModules,
      "@modelcontextprotocol/sdk/node_modules/ajv/package.json",
    );
    expect(fs.existsSync(nestedAjv)).toBe(true);

    const second = assembleElectronRuntimeDeps({
      outputDirectory,
      projectRoot: PROJECT_ROOT,
      roots: AUDITED_ROOTS,
      smoke: false,
    });
    const secondText = fs.readFileSync(second.inventoryPath, "utf8");
    expect(secondText).toBe(firstText);

    const smoke = spawnSync(
      process.execPath,
      [
        "-e",
        `
const path = require("node:path");
async function main() {
  await import("@modelcontextprotocol/sdk/server/mcp.js");
  await import("ws");
  await import("zod");
  await import("yaml");
  const contractRoot = process.env.AURIS_CONTRACT_ROOT;
  require(path.join(contractRoot, "shared", "browser-contract.cjs"));
  require(path.join(contractRoot, "shared", "nia-definition-contract.cjs"));
  require(path.join(contractRoot, "shared", "nia-workflow-contract.cjs"));
  require(path.join(contractRoot, "shared", "browser-workflow-contract.cjs"));
  console.log("ok");
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`,
      ],
      {
        cwd: outputDirectory,
        env: {
          ...process.env,
          AURIS_CONTRACT_ROOT: path.join(PROJECT_ROOT, "electron"),
          NODE_PATH: "",
          NODE_OPTIONS: "",
        },
        encoding: "utf8",
        shell: false,
      },
    );
    expect(smoke.status, smoke.stderr || smoke.stdout).toBe(0);
    expect((smoke.stdout || "").trim()).toBe("ok");
  }, 60_000);
});
