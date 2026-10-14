"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const {
  createMcpClientCredentialStore,
} = require("../../electron/mcp/client-credential-store.cjs");

const BROWSER_WORKFLOW = `---\nsite: example.com\ninputs: {}\ntrigger: manual\n---\n\n1. confirm: Packaged smoke pause\n`;
const NIA_WORKFLOW = `name: Packaged template\nnia: v1\nsteps:\n  - id: render\n    uses: nia/template\n    with:\n      template: packaged-ok\n`;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readOptional(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return `<unavailable: ${error?.code ?? error}>`;
  }
}

function waitForFile(filePath, child, timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (fs.existsSync(filePath)) return resolve();
      if (child.exitCode !== null)
        return reject(
          new Error(`Packaged Auris exited with ${child.exitCode}.`),
        );
      if (Date.now() - started > timeoutMs)
        return reject(
          new Error("Timed out waiting for packaged MCP discovery."),
        );
      setTimeout(poll, 100);
    };
    poll();
  });
}

function parseToolPayload(result) {
  const part = Array.isArray(result?.content)
    ? result.content.find(
        (entry) => entry?.type === "text" && typeof entry.text === "string",
      )
    : null;
  if (!part) return result;
  try {
    return JSON.parse(part.text);
  } catch {
    return part.text;
  }
}

async function waitFor(read, predicate, label, timeoutMs = 30_000) {
  const started = Date.now();
  let latest;
  while (Date.now() - started <= timeoutMs) {
    latest = await read();
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${label} timed out: ${JSON.stringify(latest)}`);
}

function writeIsolatedConfig(userData, vaultPath) {
  fs.mkdirSync(path.join(userData, "nia"), { recursive: true });
  fs.writeFileSync(
    path.join(userData, "shadowing-desktop-config.json"),
    `${JSON.stringify(
      {
        browserAutomationEnabled: true,
        mcp: { autoApproveEdits: false, enabled: true, startOnLaunch: true },
        pluginsEnabled: {},
        vaultPath,
        knownVaultRoots: [vaultPath],
        videoLibraryPath: null,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  const digest = `sha256:${crypto.createHash("sha256").update(BROWSER_WORKFLOW).digest("hex")}`;
  fs.writeFileSync(
    path.join(userData, "nia", "browser-workflow-reviews.json"),
    `${JSON.stringify({ approvedSourceHashes: [digest] }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function runPackagedModuleProbes(binary, appRoot, temporaryRoot) {
  const sidecar = path.join(
    appRoot,
    "Contents",
    "Resources",
    "app.asar",
    "electron",
    "auris-notes-mcp-server.mjs",
  );
  const environment = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_OPTIONS: "",
    NODE_PATH: "",
  };
  const health = spawnSync(binary, [sidecar, "--health-check"], {
    cwd: temporaryRoot,
    encoding: "utf8",
    env: environment,
    timeout: 30_000,
  });
  assert(
    health.status === 0,
    health.stderr || health.stdout || "Packaged sidecar health check failed.",
  );
  assert(
    !/MODULE_NOT_FOUND/u.test(`${health.stdout}${health.stderr}`),
    "Packaged sidecar fell back to a missing module.",
  );
  const healthPayload = JSON.parse(health.stdout.trim());
  assert(
    healthPayload.tools.includes("auris_browser") &&
      healthPayload.tools.includes("auris_browser_read") &&
      healthPayload.tools.includes("auris_workflow"),
    "Packaged sidecar tools are incomplete.",
  );

  const probe = `
const path = require("node:path");
const root = process.env.AURIS_PACKAGED_ASAR;
require(path.join(root, "electron/shared/browser-contract.cjs"));
require(path.join(root, "electron/shared/nia-definition-contract.cjs"));
require(path.join(root, "electron/shared/nia-workflow-contract.cjs"));
require(path.join(root, "electron/shared/browser-workflow-contract.cjs"));
const { createNiaWorkflowRuntime } = require(path.join(root, "electron/workflows/nia-workflow-runtime.cjs"));
const { createBrowserWorkflowRuntime } = require(path.join(root, "electron/workflows/browser-workflow-runtime.cjs"));
async function waitFor(read, expected) { for (let i=0;i<80;i+=1) { const state=read(); if(state.status===expected)return state; await new Promise(setImmediate); } throw new Error(expected); }
(async () => {
 const nia=createNiaWorkflowRuntime({createRunId:()=>"packaged-nia"});
 const ns=await nia.startRun({ownerId:"packaged-owner",request:{source:${JSON.stringify(NIA_WORKFLOW)}}});
 await waitFor(()=>nia.getRun({runId:ns.runId,ownerId:"packaged-owner"}),"completed");
 const browser=createBrowserWorkflowRuntime({reviewDefinition:async()=>true,dispatcher:{dispatch:async({params})=>params.request.action==="acquire_control"?{control:{...params.target,leaseToken:"packaged-lease"},target:{url:"https://example.com/"}}:{ok:true}}});
 const bs=await browser.start({ownerId:"packaged-browser",request:{source:${JSON.stringify(BROWSER_WORKFLOW)},target:{windowId:"w",tabId:"t"}}});
 await waitFor(()=>browser.getState(bs.runId,"packaged-browser"),"awaiting_confirmation");
 const cancelled=browser.cancel(bs.runId,"packaged-browser");
 if(cancelled.status!=="cancelled")throw new Error("cancel failed");
 process.stdout.write(JSON.stringify({ok:true,nia:"completed",browser:"cancelled"})+"\\n");
})().catch((error)=>{console.error(error);process.exit(1)});
`;
  const runtime = spawnSync(binary, ["-e", probe], {
    cwd: temporaryRoot,
    encoding: "utf8",
    env: {
      ...environment,
      AURIS_PACKAGED_ASAR: path.join(
        appRoot,
        "Contents",
        "Resources",
        "app.asar",
      ),
    },
    timeout: 30_000,
  });
  assert(
    runtime.status === 0,
    runtime.stderr ||
      runtime.stdout ||
      "Packaged workflow runtime probe failed.",
  );
  assert(
    !/MODULE_NOT_FOUND/u.test(`${runtime.stdout}${runtime.stderr}`),
    "Packaged workflow runtime missed a dependency.",
  );
  return {
    healthPayload,
    runtimePayload: JSON.parse(runtime.stdout.trim()),
    sidecar,
  };
}

async function main() {
  const sourceApp = argument("--app");
  assert(
    sourceApp && fs.existsSync(sourceApp),
    "Pass an existing .app with --app.",
  );
  // Electron canonicalizes the executable path on macOS (`/var` becomes
  // `/private/var`). Keep ASAR arguments on the same canonical root or Node's
  // ASAR loader silently skips the entry module.
  const temporaryRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "auris-packaged-smoke-")),
  );
  const appRoot = path.join(temporaryRoot, "Auris.app");
  fs.cpSync(sourceApp, appRoot, { recursive: true, verbatimSymlinks: true });
  const binary = path.join(appRoot, "Contents", "MacOS", "Auris");
  const discoveryPath = path.join(temporaryRoot, "auris-notes-mcp-port");
  const userData = path.join(temporaryRoot, "user-data");
  // Notes exposes its renderer facade only while /notes is mounted.
  // Open a temporary note at startup rather than relying on the default home.
  const vaultPath = path.join(temporaryRoot, "vault");
  fs.mkdirSync(vaultPath);
  const fixturePath = path.join(vaultPath, "packaged-mcp-smoke.md");
  fs.writeFileSync(fixturePath, "# Packaged MCP smoke\n\nTemporary note.\n");
  writeIsolatedConfig(userData, vaultPath);
  const credentialRegistryPath = path.join(temporaryRoot, "auris-mcp-clients.json");
  const credential = await createMcpClientCredentialStore({
    registryPath: credentialRegistryPath,
  }).issue("auris-packaged-smoke");
  const probes = runPackagedModuleProbes(binary, appRoot, temporaryRoot);

  const appEnvironment = {
    ...process.env,
    AURIS_NOTES_MCP_PORT_FILE: discoveryPath,
    AURIS_MCP_CLIENT_CREDENTIALS_FILE: credentialRegistryPath,
    AURIS_MCP_CLIENT_ID: credential.clientId,
    AURIS_MCP_CLIENT_TOKEN: credential.token,
    AURIS_PACKAGED_SMOKE: "1",
    AURIS_PACKAGED_SMOKE_USER_DATA: userData,
    NODE_OPTIONS: "",
    NODE_PATH: "",
  };
  delete appEnvironment.ELECTRON_RUN_AS_NODE;
  delete appEnvironment.SHADOWING_DESKTOP_URL;
  const application = spawn(binary, [`--user-data-dir=${userData}`, fixturePath], {
    cwd: temporaryRoot,
    env: appEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let appOutput = "";
  application.stdout.on("data", (chunk) => {
    appOutput += String(chunk);
  });
  application.stderr.on("data", (chunk) => {
    appOutput += String(chunk);
  });

  let client;
  let transport;
  let sidecarOutput = "";
  try {
    await waitForFile(discoveryPath, application);
    const { Client } =
      await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } =
      await import("@modelcontextprotocol/sdk/client/stdio.js");
    transport = new StdioClientTransport({
      args: [probes.sidecar],
      command: binary,
      cwd: temporaryRoot,
      env: {
        ...appEnvironment,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk) => {
      sidecarOutput += String(chunk);
    });
    client = new Client({ name: "auris-packaged-smoke", version: "1.0.0" });
    await client.connect(transport);
    const call = async (name, args) => {
      const raw = await client.callTool({ arguments: args, name });
      return { isError: raw.isError === true, payload: parseToolPayload(raw) };
    };
    const tools = await client.listTools();
    assert(
      tools.tools.some((tool) => tool.name === "auris_browser") &&
        tools.tools.some((tool) => tool.name === "auris_browser_read"),
      "Packaged MCP browser tools missing.",
    );
    assert(
      tools.tools.some((tool) => tool.name === "auris_workflow"),
      "Packaged MCP workflow tool missing.",
    );

    const session = await waitFor(
      () => call("auris_session", { action: "get_state" }),
      (value) => !value.isError,
      "packaged Notes state",
    );
    const browser = await waitFor(
      () => call("auris_browser_read", { action: "get_state" }),
      (value) => !value.isError,
      "packaged Browser state",
    );
    const listed = await call("auris_workflow", { action: "list" });
    assert(
      !listed.isError,
      `Packaged workflow list failed: ${JSON.stringify(listed.payload)}`,
    );

    const niaStarted = await call("auris_workflow", {
      action: "start",
      family: "nia_yaml",
      source: NIA_WORKFLOW,
    });
    assert(
      !niaStarted.isError,
      `Packaged Nia start failed: ${JSON.stringify(niaStarted.payload)}`,
    );
    const niaRunId = String(niaStarted.payload?.runId ?? "");
    const niaDone = await waitFor(
      () =>
        call("auris_workflow", {
          action: "get_state",
          family: "nia_yaml",
          run_id: niaRunId,
        }),
      (value) => value.payload?.status === "completed",
      "packaged Nia workflow",
    );

    const opened = await call("auris_browser", {
      action: "open",
      url: "https://example.com/",
    });
    assert(
      !opened.isError,
      `Packaged browser open failed: ${JSON.stringify(opened.payload)}`,
    );
    const control = opened.payload?.control;
    assert(
      control?.windowId && control?.tabId && control?.leaseToken,
      "Packaged browser control missing.",
    );

    // Production session replay stays fail-closed even when automation is on.
    const sessionDenied = await call("auris_browser", {
      action: "session_save",
      name: "packaged-smoke",
      ...control,
    });
    assert(
      sessionDenied.isError === true,
      "Packaged session_save must fail closed while replay capabilities are off.",
    );
    const sessionCode =
      sessionDenied.payload?.error?.code
      || sessionDenied.payload?.code
      || null;
    assert(
      sessionCode === "CAPABILITY_NOT_VERIFIED",
      `Packaged session_save expected CAPABILITY_NOT_VERIFIED, got: ${JSON.stringify(sessionDenied.payload)}`,
    );

    const released = await call("auris_browser", {
      action: "release_control",
      ...control,
    });
    assert(
      !released.isError,
      `Packaged browser release failed: ${JSON.stringify(released.payload)}`,
    );

    const browserStarted = await call("auris_workflow", {
      action: "start",
      family: "browser_markdown",
      source: BROWSER_WORKFLOW,
      window_id: control.windowId,
      tab_id: control.tabId,
    });
    assert(
      !browserStarted.isError,
      `Packaged browser workflow start failed: ${JSON.stringify(browserStarted.payload)}`,
    );
    const browserRunId = String(browserStarted.payload?.runId ?? "");
    await waitFor(
      () =>
        call("auris_workflow", {
          action: "get_state",
          family: "browser_markdown",
          run_id: browserRunId,
        }),
      (value) => value.payload?.status === "awaiting_confirmation",
      "packaged browser workflow pause",
    );
    const browserResumed = await call("auris_workflow", {
      action: "resume",
      family: "browser_markdown",
      run_id: browserRunId,
      approved: true,
    });
    assert(
      !browserResumed.isError,
      `Packaged browser workflow resume failed: ${JSON.stringify(browserResumed.payload)}`,
    );
    const browserDone = await waitFor(
      () =>
        call("auris_workflow", {
          action: "get_state",
          family: "browser_markdown",
          run_id: browserRunId,
        }),
      (value) => value.payload?.status === "completed",
      "packaged browser workflow complete after resume",
    );

    process.stdout.write(
      `${JSON.stringify({
        browserState: browser.payload,
        moduleProbe: probes.runtimePayload,
        niaStatus: niaDone.payload.status,
        notesState: session.payload,
        ok: true,
        tools: tools.tools.map((tool) => tool.name).sort(),
        workflowStatus: browserDone.payload.status,
      })}\n`,
    );
  } catch (error) {
    throw new Error(
      `${error?.message ?? error}\nApplication exit: ${application.exitCode ?? "running"}\nDiscovery: ${readOptional(discoveryPath)}\nPackaged sidecar output:\n${sidecarOutput.slice(-4_000)}\nPackaged app output:\n${appOutput.slice(-8_000)}`,
    );
  } finally {
    await client?.close().catch(() => undefined);
    await transport?.close().catch(() => undefined);
    if (application.exitCode === null) application.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (process.env.AURIS_PACKAGED_SMOKE_KEEP !== "1") {
      fs.rmSync(temporaryRoot, { force: true, recursive: true });
    } else {
      process.stderr.write(`Preserved packaged smoke root: ${temporaryRoot}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
