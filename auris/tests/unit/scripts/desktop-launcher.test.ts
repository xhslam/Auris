import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const launcherPath = path.join(process.cwd(), "scripts", "desktop-launcher.cjs");

function loadLauncher() {
  expect(fs.existsSync(launcherPath), "desktop launcher module exists").toBe(true);
  return require(launcherPath) as {
    createDesktopLaunchPlan: (input: {
      argv: string[];
      existsSync: (targetPath: string) => boolean;
      execPath: string;
      platform?: NodeJS.Platform;
      projectRoot: string;
    }) => {
      args?: string[];
      code?: string;
      command?: string;
      cwd?: string;
      missing?: string[];
      ok: boolean;
    };
    formatMissingDependencyMessage: (plan: { missing?: string[] }) => string;
    getNpmCommand: (platform: NodeJS.Platform) => string;
  };
}

describe("desktop launcher", () => {
  test("reports a repairable dependency problem when Electron is incomplete", () => {
    const { createDesktopLaunchPlan, formatMissingDependencyMessage } = loadLauncher();
    const projectRoot = path.join(process.cwd(), "fake-project");
    const existingPaths = new Set([
      path.join(projectRoot, "electron", "main.cjs"),
      path.join(projectRoot, "package.json"),
    ]);

    const plan = createDesktopLaunchPlan({
      argv: ["--dev"],
      execPath: path.join(projectRoot, "node.exe"),
      existsSync: (targetPath) => existingPaths.has(targetPath),
      projectRoot,
    });

    expect(plan.ok).toBe(false);
    expect(plan.code).toBe("MISSING_DESKTOP_DEPENDENCIES");
    expect(plan.missing).toContain(path.join(projectRoot, "node_modules", "electron", "cli.js"));
    expect(formatMissingDependencyMessage(plan)).toContain("npm install --include=dev");
  });

  test("reports a repairable dependency problem when the Electron runtime is missing", () => {
    const { createDesktopLaunchPlan } = loadLauncher();
    const projectRoot = path.join(process.cwd(), "fake-project");
    const existingPaths = new Set([
      path.join(projectRoot, "electron", "main.cjs"),
      path.join(projectRoot, "node_modules", "electron", "cli.js"),
      path.join(projectRoot, "package.json"),
    ]);

    const plan = createDesktopLaunchPlan({
      argv: ["--dev"],
      execPath: path.join(projectRoot, "node.exe"),
      existsSync: (targetPath) => existingPaths.has(targetPath),
      platform: "win32",
      projectRoot,
    });

    expect(plan.ok).toBe(false);
    expect(plan.code).toBe("MISSING_DESKTOP_DEPENDENCIES");
    expect(plan.missing).toContain(
      path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe"),
    );
  });

  test("launches Electron through the package cli when dependencies are present", () => {
    const { createDesktopLaunchPlan } = loadLauncher();
    const projectRoot = path.join(process.cwd(), "fake-project");
    const electronCliPath = path.join(projectRoot, "node_modules", "electron", "cli.js");
    const mainPath = path.join(projectRoot, "electron", "main.cjs");
    const existingPaths = new Set([
      electronCliPath,
      mainPath,
      path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe"),
      path.join(projectRoot, "node_modules", "electron", "path.txt"),
      path.join(projectRoot, "package.json"),
    ]);

    const plan = createDesktopLaunchPlan({
      argv: ["--dev"],
      execPath: path.join(projectRoot, "node.exe"),
      existsSync: (targetPath) => existingPaths.has(targetPath),
      platform: "win32",
      projectRoot,
    });

    expect(plan).toEqual({
      args: [electronCliPath, mainPath, "--dev"],
      command: path.join(projectRoot, "node.exe"),
      cwd: projectRoot,
      ok: true,
    });
  });

  test("uses the Windows npm command shim on Windows", () => {
    const { getNpmCommand } = loadLauncher();

    expect(getNpmCommand("win32")).toBe("npm.cmd");
    expect(getNpmCommand("linux")).toBe("npm");
  });
});
