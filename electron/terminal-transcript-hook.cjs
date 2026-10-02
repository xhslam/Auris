// Claude/Codex SessionStart and Antigravity invocation hooks.
// Outside an enabled Auris shell no binding is written.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const antigravity = process.argv.includes("--antigravity");
// A neutral response satisfies Antigravity's contract without injecting model context.
if (antigravity) process.stdout.write("{}\n");
const token = process.env.AURIS_TRANSCRIPT_TOKEN;
if (/^[a-f0-9-]{36}$/i.test(token || "") && fs.existsSync(path.join(__dirname, "enabled"))) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
    if (input.length > 65536) process.exit(0);
  });
  process.stdin.on("end", () => {
    let temporary;
    try {
      const value = JSON.parse(input);
      if (!antigravity && value.hook_event_name !== "SessionStart") return;
      if (antigravity && !/^[a-f0-9-]{36}$/i.test(value.conversationId || "")) return;
      const transcriptPath = antigravity ? value.transcriptPath : value.transcript_path;
      if (typeof transcriptPath !== "string" || !path.isAbsolute(transcriptPath)) return;
      const destination = path.join(__dirname, `${token}.json`);
      temporary = `${destination}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({ path: transcriptPath }), { mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, destination);
    } catch {
      if (temporary) { try { fs.unlinkSync(temporary); } catch {} }
      // Preview must never prevent a CLI from starting.
    }
  });
}
