const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MAX_LINE_BYTES = 64 * 1024;

function resolveDesktopIslandHelperPath({ app, appRoot, arch = process.arch }) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "native", "desktop-island", "AurisDesktopIslandHelper");
  }
  return path.join(appRoot, "build", "native", "desktop-island", arch, "AurisDesktopIslandHelper");
}

class MacDesktopIslandNativeHost {
  constructor({ app, appRoot, logger = () => undefined, onEvent = () => undefined }) {
    this.app = app;
    this.appRoot = appRoot;
    this.logger = logger;
    this.onEvent = onEvent;
    this.child = null;
    this.buffer = "";
    this.ready = false;
  }

  start() {
    if (process.platform !== "darwin" || this.child) return false;
    const executable = resolveDesktopIslandHelperPath({ app: this.app, appRoot: this.appRoot });
    try {
      fs.accessSync(executable, fs.constants.X_OK);
      const child = spawn(executable, [String(process.pid)], {
        env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => this.consume(chunk));
      child.stderr.on("data", (chunk) => this.logger("desktop-island:helper-stderr", {
        bytes: Buffer.byteLength(chunk),
      }));
      child.on("error", (error) => this.logger("desktop-island:helper-error", { message: error.message }));
      child.on("exit", (code, signal) => {
        this.child = null;
        this.ready = false;
        this.logger("desktop-island:helper-exit", { code, signal });
      });
      return true;
    } catch (error) {
      this.logger("desktop-island:helper-unavailable", {
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  consume(chunk) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES) {
      this.buffer = "";
      this.logger("desktop-island:helper-line-too-large");
      return;
    }
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        try {
          const event = JSON.parse(line);
          if (event?.type === "ready") this.ready = true;
          this.onEvent(event);
        } catch {
          this.logger("desktop-island:helper-invalid-json");
        }
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  send(message) {
    if (!this.child?.stdin?.writable) return false;
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
    return true;
  }

  dispose() {
    const child = this.child;
    this.child = null;
    this.ready = false;
    if (!child) return;
    try { child.stdin.end(`${JSON.stringify({ type: "shutdown" })}\n`); } catch {}
    try { child.kill("SIGTERM"); } catch {}
  }
}

module.exports = { MacDesktopIslandNativeHost, resolveDesktopIslandHelperPath };
