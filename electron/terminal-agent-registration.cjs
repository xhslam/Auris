"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CLAUDE_AGENT_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SessionEnd",
  "PostToolUse",
];

function resolveAurisHooksDirectory(home = os.homedir()) {
  return path.join(home, ".auris", "hooks");
}

function copyAgentHookScript(sourcePath, options = {}) {
  const home = options.home ?? os.homedir();
  const hooksDir = options.hooksDir ?? resolveAurisHooksDirectory(home);
  fs.mkdirSync(hooksDir, { mode: 0o755, recursive: true });

  const destinationPath = path.join(hooksDir, "terminal-agent-hook.cjs");
  const sourceContent = fs.readFileSync(sourcePath, "utf8");

  let needsWrite = true;
  try {
    const existing = fs.readFileSync(destinationPath, "utf8");
    if (existing === sourceContent) {
      needsWrite = false;
    }
  } catch {
    /* file does not exist */
  }

  if (needsWrite) {
    const temporary = `${destinationPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, sourceContent, { mode: 0o755 });
    fs.renameSync(temporary, destinationPath);
  }

  return destinationPath;
}

function registerClaudeCodeHooks(hookScriptPath, options = {}) {
  const home = options.home ?? os.homedir();
  const claudeDir = path.join(home, ".claude");
  const settingsPath = path.join(claudeDir, "settings.json");

  let config = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, "utf8");
    try {
      config = JSON.parse(raw);
    } catch (parseError) {
      const message = `~/.claude/settings.json 不是合法 JSON: ${parseError.message}`;
      options.logger?.(`terminal:claude-hook-registration:invalid-json ${message}`);
      return {
        error: message,
        filePath: settingsPath,
        status: "invalid_json",
      };
    }
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    const message = "~/.claude/settings.json 顶层必须是对象";
    options.logger?.(`terminal:claude-hook-registration:invalid-structure ${message}`);
    return {
      error: message,
      filePath: settingsPath,
      status: "invalid_json",
    };
  }

  config.hooks ??= {};
  if (typeof config.hooks !== "object" || config.hooks === null || Array.isArray(config.hooks)) {
    config.hooks = {};
  }

  const normalizedHookPath = hookScriptPath.split(path.sep).join("/");
  const expectedCommand = `node "${normalizedHookPath}"`;
  let modified = false;

  for (const eventName of CLAUDE_AGENT_EVENTS) {
    config.hooks[eventName] ??= [];
    if (!Array.isArray(config.hooks[eventName])) {
      config.hooks[eventName] = [];
    }

    const eventList = config.hooks[eventName];
    let aurisHookEntry = null;

    for (const group of eventList) {
      if (!group || !Array.isArray(group.hooks)) continue;
      const match = group.hooks.find(
        (h) => typeof h?.command === "string" && h.command.includes("terminal-agent-hook.cjs"),
      );
      if (match) {
        aurisHookEntry = match;
        break;
      }
    }

    if (aurisHookEntry) {
      if (aurisHookEntry.command !== expectedCommand || aurisHookEntry.timeout !== 5) {
        aurisHookEntry.command = expectedCommand;
        aurisHookEntry.timeout = 5;
        aurisHookEntry.type = "command";
        modified = true;
      }
    } else {
      eventList.push({
        hooks: [
          {
            command: expectedCommand,
            timeout: 5,
            type: "command",
          },
        ],
      });
      modified = true;
    }
  }

  if (modified) {
    fs.mkdirSync(claudeDir, { recursive: true });
    const temporary = `${settingsPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + "\n", "utf8");
    fs.renameSync(temporary, settingsPath);
  }

  return {
    filePath: settingsPath,
    modified,
    status: "ok",
  };
}

function inspectCodexNotify(options = {}) {
  const home = options.home ?? os.homedir();
  const configPath = path.join(home, ".codex", "config.toml");

  if (!fs.existsSync(configPath)) {
    return {
      configPath,
      hasNotify: false,
      status: "skipped_no_config",
    };
  }

  const content = fs.readFileSync(configPath, "utf8");
  const hasNotify = /^\s*notify\s*=/m.test(content);

  return {
    configPath,
    hasNotify,
    status: hasNotify ? "skipped_existing" : "ready_to_configure",
  };
}

module.exports = {
  CLAUDE_AGENT_EVENTS,
  copyAgentHookScript,
  inspectCodexNotify,
  registerClaudeCodeHooks,
  resolveAurisHooksDirectory,
};
