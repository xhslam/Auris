import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createNextServerLaunchPlan,
} = require("../../../electron/next-server-launch.cjs");
const {
  StandaloneAssemblyError,
  assembleStandalone,
  findPrivateArtifacts,
} = require("../../../scripts/assemble-standalone.cjs");

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function temporaryProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auris-packaging-test-"));
  temporaryRoots.push(root);
  return root;
}

describe("desktop standalone packaging", () => {
  it("declares the packaged Electron entry point", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8"),
    ) as { main?: string };

    expect(packageJson.main).toBe("electron/main.cjs");
    expect(
      fs.existsSync(path.resolve(__dirname, "../../../", packageJson.main!)),
    ).toBe(true);
  });

  it("audits standalone privacy during desktop assembly", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["desktop:privacy:audit"]).toBe(
      "node scripts/audit-package-privacy.cjs .next/standalone",
    );
    expect(packageJson.scripts?.["desktop:assemble"]).toContain(
      "npm run desktop:privacy:audit",
    );
    expect(packageJson.scripts?.["desktop:assemble:win"]).toContain(
      "npm run desktop:privacy:audit",
    );
    expect(
      fs.existsSync(
        path.resolve(__dirname, "../../../scripts/audit-package-privacy.cjs"),
      ),
    ).toBe(true);
  });

  it("binds sensitive Notes and Vault IPC to the main renderer", () => {
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, "../../../electron/main.cjs"),
      "utf8",
    );

    expect(mainSource).toContain(
      "requireTrustedSender: requireTrustedMainEvent",
    );
    const vaultHandlers = mainSource.slice(
      mainSource.indexOf('ipcMain.handle("shadowing:vault:get-directory-info"'),
      mainSource.indexOf('ipcMain.handle("shadowing:video-library:get-snapshot"'),
    );
    expect(vaultHandlers).toContain("requireTrustedMainEvent(event)");
    expect(vaultHandlers).not.toContain("requireTrustedDesktopEvent(event)");
  });

  it("keeps packaged diagnostics outside the read-only ASAR", () => {
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, "../../../electron/main.cjs"),
      "utf8",
    );

    expect(mainSource).toContain(
      'app.isPackaged ? app.getPath("userData") : PROJECT_ROOT',
    );
    expect(mainSource).not.toContain(
      'path.join(PROJECT_ROOT, "electron-next.log")',
    );
  });

  it("copies generated static/public assets into a bounded standalone tree", () => {
    const root = temporaryProject();
    fs.mkdirSync(path.join(root, ".next", "standalone"), { recursive: true });
    fs.mkdirSync(path.join(root, ".next", "static", "chunks"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, "public"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".next", "standalone", "server.js"),
      "server\n",
    );
    fs.writeFileSync(
      path.join(root, ".next", "static", "chunks", "app.js"),
      "chunk\n",
    );
    fs.writeFileSync(path.join(root, "public", "asset.txt"), "asset\n");

    const result = assembleStandalone({ projectRoot: root });
    expect(result.staticCopied).toBe(true);
    expect(result.publicCopied).toBe(true);
    expect(
      fs.readFileSync(
        path.join(
          root,
          ".next",
          "standalone",
          ".next",
          "static",
          "chunks",
          "app.js",
        ),
        "utf8",
      ),
    ).toBe("chunk\n");
    expect(
      fs.readFileSync(
        path.join(root, ".next", "standalone", "public", "asset.txt"),
        "utf8",
      ),
    ).toBe("asset\n");
  });

  it("removes private runtime data from the generated standalone tree", () => {
    const root = temporaryProject();
    const standaloneRoot = path.join(root, ".next", "standalone");
    fs.mkdirSync(path.join(standaloneRoot, ".shadowing-data", "sessions"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(standaloneRoot, "server.js"), "server\n");
    fs.writeFileSync(
      path.join(standaloneRoot, ".shadowing-data", "sessions", "private.wav"),
      "private audio\n",
    );
    fs.writeFileSync(path.join(standaloneRoot, ".env.local"), "SECRET=value\n");

    assembleStandalone({ projectRoot: root });

    expect(fs.existsSync(path.join(standaloneRoot, ".shadowing-data"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(standaloneRoot, ".env.local"))).toBe(false);
  });

  it("detects private artifacts anywhere in a package tree", () => {
    expect(findPrivateArtifacts).toBeTypeOf("function");
    if (typeof findPrivateArtifacts !== "function") return;

    const root = temporaryProject();
    fs.mkdirSync(path.join(root, "Resources", "standalone", ".shadowing-data"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, "Resources", "standalone", "nested"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, "Resources", "standalone", ".shadowing-data", "private.wav"),
      "private audio\n",
    );
    fs.writeFileSync(
      path.join(root, "Resources", "standalone", "nested", ".env.local"),
      "SECRET=value\n",
    );
    fs.writeFileSync(
      path.join(root, "Resources", "standalone", "nested", ".env.backup"),
      "SECRET=backup\n",
    );

    expect(findPrivateArtifacts(root)).toEqual([
      path.join("Resources", "standalone", ".shadowing-data"),
      path.join("Resources", "standalone", "nested", ".env.backup"),
      path.join("Resources", "standalone", "nested", ".env.local"),
    ]);
  });

  it("fails closed without a standalone server", () => {
    const root = temporaryProject();
    expect(() => assembleStandalone({ projectRoot: root })).toThrowError(
      StandaloneAssemblyError,
    );
  });

  it("uses a background utility process for the packaged server", () => {
    const resourcesPath = path.join(
      temporaryProject(),
      "Auris.app",
      "Contents",
      "Resources",
    );
    const serverPath = path.join(resourcesPath, "standalone", "server.js");
    fs.mkdirSync(path.dirname(serverPath), { recursive: true });
    fs.writeFileSync(serverPath, "server\n");

    const plan = createNextServerLaunchPlan({
      isDevelopment: false,
      isPackaged: true,
      nextCliPath: null,
      nodeCommand: "node",
      port: 3456,
      projectRoot: "/workspace/auris",
      resourcesPath,
    });
    expect(plan).toEqual({
      args: [],
      cwd: path.dirname(serverPath),
      env: {
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
        PORT: "3456",
      },
      modulePath: serverPath,
      serviceName: "auris-next-server",
      type: "utility",
    });
    expect(JSON.stringify(plan)).not.toContain("ELECTRON_RUN_AS_NODE");
    expect(JSON.stringify(plan)).not.toContain("Contents/MacOS/Auris");
  });

  it("single-flights renderer and window startup", () => {
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, "../../../electron/main.cjs"),
      "utf8",
    );

    expect(mainSource).toContain("utilityProcess.fork");
    expect(mainSource).toContain("nextServerStartPromise");
    expect(mainSource).toContain("nextProcessReady");
    expect(mainSource).toContain("ensureMainWindow");
  });
});
