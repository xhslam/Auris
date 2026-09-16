import { describe, expect, it } from "vitest";
import { buildCcSwitchImportLink } from "@/utils/ccswitchLink";

function parseQuery(link: string): Record<string, string> {
  const q = link.slice(link.indexOf("?") + 1);
  const out: Record<string, string> = {};
  for (const pair of q.split("&")) {
    const i = pair.indexOf("=");
    out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
  }
  return out;
}

function decodeConfig(link: string): Record<string, unknown> {
  const b64 = parseQuery(link).config;
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

describe("buildCcSwitchImportLink", () => {
  it("uses the ccswitch://v1/import scheme and path", () => {
    expect(buildCcSwitchImportLink("/Applications/Auris.app/Contents/MacOS/Auris")).toMatch(
      /^ccswitch:\/\/v1\/import\?/,
    );
  });

  it("sets resource=mcp and name=auris-notes", () => {
    const q = parseQuery(buildCcSwitchImportLink("/bin/auris"));
    expect(q.resource).toBe("mcp");
    expect(q.name).toBe("auris-notes");
  });

  it("defaults apps to claude,codex,grok,opencode", () => {
    const link = buildCcSwitchImportLink("/bin/auris");
    expect(link).toContain("apps=claude,codex,grok,opencode");
  });

  it("Base64-encodes config and wraps entry in mcpServers", () => {
    const execPath = "/Applications/Auris.app/Contents/MacOS/Auris";
    const scriptPath = "/Applications/Auris.app/Contents/Resources/auris-notes-mcp-server.mjs";
    const link = buildCcSwitchImportLink(execPath, [scriptPath]);
    const config = decodeConfig(link);
    expect(config).toEqual({
      mcpServers: {
        "auris-notes": {
          args: [scriptPath],
          command: execPath,
          env: {
            ELECTRON_RUN_AS_NODE: "1",
          },
        },
      },
    });
  });

  it("honors custom apps list", () => {
    const q = parseQuery(buildCcSwitchImportLink("/bin/auris", [], ["claude", "opencode"]));
    expect(q.apps).toBe("claude,opencode");
  });
});
