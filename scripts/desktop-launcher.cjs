const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MISSING_DEPENDENCIES_CODE = "MISSING_DESKTOP_DEPENDENCIES";

function getNpmCommand(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

function getElectronPlatformPath(platform = process.platform) {
  if (platform === "darwin") {
    return path.join("Electron.app", "Contents", "MacOS", "Electron");
  }

  return platform === "win32" ? "electron.exe" : "electron";
}

function getRequiredDesktopFiles(projectRoot, platform = process.platform) {
  return [
    {
      label: "package.json",
      path: path.join(projectRoot, "package.json"),
    },
    {
      label: "Electron main process",
      path: path.join(projectRoot, "electron", "main.cjs"),
    },
    {
      label: "Electron CLI",
      path: path.join(projectRoot, "node_modules", "electron", "cli.js"),
    },
    {
      label: "Electron runtime manifest",
      path: path.join(projectRoot, "node_modules", "electron", "path.txt"),
    },
    {
      label: "Electron runtime",
      path: path.join(
        projectRoot,
        "node_modules",
        "electron",
        "dist",
        getElectronPlatformPath(platform),
      ),
    },
  ];
}

function createDesktopLaunchPlan({
  argv = [],
  existsSync = fs.existsSync,
  execPath = process.execPath,
  platform = process.platform,
  projectRoot = path.resolve(__dirname, ".."),
} = {}) {
  const requiredFiles = getRequiredDesktopFiles(projectRoot, platform);
  const missing = requiredFiles
    .filter((item) => !existsSync(item.path))
    .map((item) => item.path);

  if (missing.length > 0) {
    return {
      code: MISSING_DEPENDENCIES_CODE,
      missing,
      ok: false,
      projectRoot,
      repairCommand: "npm install --include=dev",
    };
  }

  const electronCliPath = path.join(projectRoot, "node_modules", "electron", "cli.js");
  const electronMainPath = path.join(projectRoot, "electron", "main.cjs");

  return {
    args: [electronCliPath, electronMainPath, ...argv],
    command: execPath,
    cwd: projectRoot,
    ok: true,
  };
}

function formatMissingDependencyMessage(plan) {
  const missing = Array.isArray(plan.missing) ? plan.missing : [];
  const missingList = missing.map((item) => `  - ${item}`).join("\n");
  const repairCommand = plan.repairCommand || `${getNpmCommand()} install --include=dev`;
  const projectRoot = plan.projectRoot || process.cwd();

  return [
    "Auris could not start because desktop dependencies are incomplete.",
    "",
    "Missing files:",
    missingList || "  - Unknown dependency file",
    "",
    "Repair from the project directory:",
    `  cd /d "${projectRoot}"`,
    `  ${repairCommand}`,
    "",
    "After the install finishes, run the desktop launcher again.",
  ].join("\n");
}

function spawnElectron(plan, spawnProcess = spawn) {
  return new Promise((resolve) => {
    const child = spawnProcess(plan.command, plan.args, {
      cwd: plan.cwd,
      env: process.env,
      stdio: "inherit",
      windowsHide: false,
    });

    child.once("error", (error) => {
      console.error(`Failed to start Electron: ${error instanceof Error ? error.message : error}`);
      resolve(1);
    });

    child.once("exit", (code, signal) => {
      if (signal) {
        console.error(`Electron exited after receiving signal ${signal}.`);
        resolve(1);
        return;
      }

      resolve(typeof code === "number" ? code : 1);
    });
  });
}

async function runDesktopLauncher({
  argv = process.argv.slice(2),
  console: output = console,
  existsSync = fs.existsSync,
  execPath = process.execPath,
  projectRoot = path.resolve(__dirname, ".."),
  spawnProcess = spawn,
} = {}) {
  const plan = createDesktopLaunchPlan({
    argv,
    existsSync,
    execPath,
    projectRoot,
  });

  if (!plan.ok) {
    output.error(formatMissingDependencyMessage(plan));
    return 1;
  }

  return spawnElectron(plan, spawnProcess);
}

if (require.main === module) {
  runDesktopLauncher().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  createDesktopLaunchPlan,
  formatMissingDependencyMessage,
  getNpmCommand,
  runDesktopLauncher,
};
