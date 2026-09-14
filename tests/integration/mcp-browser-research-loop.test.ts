import { afterEach, describe, expect, it } from "vitest";
import {
  INITIAL_NOTE_REVISION,
  approveAndRetry,
  asRecord,
  browserErrorCode,
  createStdioMcpClient,
  extractControl,
  launchBrowserResearchTestApp,
  type SpawnedTestApp,
  type StdioMcpClient,
} from "../helpers/stdio-mcp-client";

describe("MCP browser research loop", () => {
  let app: SpawnedTestApp | null = null;
  let client: StdioMcpClient | null = null;

  afterEach(async () => {
    await client?.close().catch(() => undefined);
    client = null;
    await app?.stop().catch(() => undefined);
    app = null;
  });

  it("completes open → approve → act → wait → evidence → Notes pending review", async () => {
    app = await launchBrowserResearchTestApp();
    client = await createStdioMcpClient({ discoveryPath: app.discoveryPath });

    const opened = await client.callTool("auris_browser", {
      action: "open",
      url: `${app.fixtureOrigin}/research-form.html`,
    });
    expect(opened.isError).not.toBe(true);
    const control = extractControl(opened.payload);
    expect(control.leaseToken.length).toBeGreaterThan(16);
    expect(control.windowId).toBeTruthy();
    expect(control.tabId).toBeTruthy();

    const read = await client.callTool("auris_browser", {
      ...control,
      action: "read",
    });
    expect(read.isError).not.toBe(true);
    const readPayload = asRecord(read.payload);
    expect(JSON.stringify(readPayload)).toMatch(/Research intake|Topic/i);

    const typed = await approveAndRetry(client, app.control, {
      ...control,
      action: "act",
      text: "phase-three-loop",
      variant: "type",
      target: { kind: "selector", selector: "#topic" },
    });
    expect(typed.isError).not.toBe(true);
    expect(browserErrorCode(typed.payload)).toBeNull();

    const clicked = await approveAndRetry(client, app.control, {
      ...control,
      action: "act",
      variant: "click",
      target: { kind: "selector", selector: "#submit" },
    });
    expect(clicked.isError).not.toBe(true);

    const waited = await client.callTool("auris_browser", {
      ...control,
      action: "wait_for",
      target: { kind: "selector", selector: "#result" },
      timeoutMs: 5_000,
    });
    expect(waited.isError).not.toBe(true);

    const screenshot = await approveAndRetry(client, app.control, {
      ...control,
      action: "screenshot",
      publication: "evidence",
    });
    if (screenshot.isError || browserErrorCode(screenshot.payload)) {
      throw new Error(`screenshot failed: ${JSON.stringify(screenshot.payload)}`);
    }
    const screenshotRef = String(asRecord(screenshot.payload).evidenceRef ?? "");
    expect(screenshotRef).toMatch(/^screenshot-[0-9a-f]{32}$/);

    const accessedAt = new Date().toISOString();
    const evidence = {
      approvals: [
        { action: "act", decision: "allow_once", operation: "type" },
        { action: "act", decision: "allow_once", operation: "click" },
      ],
      citations: [{ draftRange: { end: 24, start: 0 }, sourceId: "source-1" }],
      excerpts: [{
        sourceId: "source-1",
        text: "Research complete: phase-three-loop",
      }],
      screenshots: [{ evidenceRef: screenshotRef }],
      source: {
        accessedAt,
        finalUrl: `${app.fixtureOrigin}/research-form.html`,
        origin: app.fixtureOrigin,
        title: "Auris Research Form",
      },
      version: 1 as const,
    };

    const stale = await client.callTool("auris_document", {
      action: "write",
      content: "# Draft\n\nResearch complete: phase-three-loop\n",
      evidence,
      expected_revision: "sha256-stale",
    });
    expect(String(stale.payload)).toMatch(/STALE/i);

    const proposed = await client.callTool("auris_document", {
      action: "write",
      content: "# Draft\n\nResearch complete: phase-three-loop\n",
      evidence,
      expected_revision: INITIAL_NOTE_REVISION,
    });
    expect(proposed.isError).not.toBe(true);
    expect(asRecord(proposed.payload)).toMatchObject({
      pending_review: {
        kind: "document",
        path: "Inbox/Daily.md",
      },
    });

    const pendingNotes = await app.control.listPendingNotes();
    expect(pendingNotes).toHaveLength(1);
    const pending = asRecord(pendingNotes[0]);
    expect(pending).toMatchObject({
      afterSource: "# Draft\n\nResearch complete: phase-three-loop\n",
      kind: "document",
      path: "Inbox/Daily.md",
    });
    expect(asRecord(pending.evidence)).toMatchObject({
      source: {
        finalUrl: `${app.fixtureOrigin}/research-form.html`,
        origin: app.fixtureOrigin,
        title: "Auris Research Form",
      },
      version: 1,
    });
    expect(JSON.stringify(pending.evidence)).not.toMatch(
      /leaseToken|payloadHash|keychain|sessionId/i,
    );
  }, 120_000);
});
