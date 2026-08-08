import { afterEach, describe, expect, it } from "vitest";
import {
  approveAndRetry,
  asRecord,
  browserErrorCode,
  createStdioMcpClient,
  extractControl,
  launchBrowserResearchTestApp,
  type SpawnedTestApp,
  type StdioMcpClient,
} from "../helpers/stdio-mcp-client";

describe("MCP browser failure paths", () => {
  let app: SpawnedTestApp | null = null;
  let client: StdioMcpClient | null = null;

  afterEach(async () => {
    await client?.close().catch(() => undefined);
    client = null;
    await app?.stop().catch(() => undefined);
    app = null;
  });

  it("rejects wrong lease tokens, denied approvals, unsupported ops, and sidecar exit", async () => {
    app = await launchBrowserResearchTestApp();
    client = await createStdioMcpClient({ discoveryPath: app.discoveryPath });

    const opened = await client.callTool("auris_browser", {
      action: "open",
      url: `${app.fixtureOrigin}/research-form.html`,
    });
    const control = extractControl(opened.payload);

    const wrongToken = await client.callTool("auris_browser", {
      ...control,
      action: "read",
      leaseToken: "lease_00000000000000000000000000000000",
    });
    expect(browserErrorCode(wrongToken.payload)).toBe("LEASE_LOST");

    const deniedFirst = await client.callTool("auris_browser", {
      ...control,
      action: "act",
      variant: "click",
      target: { kind: "selector", selector: "#submit" },
    });
    expect(browserErrorCode(deniedFirst.payload)).toBe("APPROVAL_REQUIRED");
    const metadata = asRecord(asRecord(deniedFirst.payload).error).metadata as Record<string, unknown>;
    const deniedApprovalId = String(metadata.approvalId ?? "");
    await app.control.resolveApproval({
      approvalId: deniedApprovalId,
      decision: "deny",
      windowId: control.windowId,
    });
    const deniedRetry = await client.callTool("auris_browser", {
      ...control,
      action: "act",
      approvalId: deniedApprovalId,
      variant: "click",
      target: { kind: "selector", selector: "#submit" },
    });
    expect(["APPROVAL_DENIED", "APPROVAL_EXPIRED", "APPROVAL_REQUIRED"]).toContain(
      browserErrorCode(deniedRetry.payload),
    );

    const evalGate = await client.callTool("auris_browser", {
      ...control,
      action: "execute_js",
      source: "1+1",
    });
    // Exact-approved AiSandbox eval is Phase 4 scoped; first call must park.
    expect(browserErrorCode(evalGate.payload)).toBe("APPROVAL_REQUIRED");

    // Prove a later approved action still works on a fresh approval after deny.
    const recovered = await approveAndRetry(client, app.control, {
      ...control,
      action: "act",
      text: "recover",
      variant: "type",
      target: { kind: "selector", selector: "#topic" },
    });
    expect(browserErrorCode(recovered.payload)).toBeNull();

    await client.close();
    client = null;
    await app.stop();
    app = null;

    const dead = await createStdioMcpClient({
      discoveryPath: "/tmp/auris-missing-discovery-file.json",
      name: "auris-mcp-browser-dead",
    });
    const deadResult = await dead.callTool("auris_session", { action: "get_state" });
    expect(deadResult.isError).toBe(true);
    expect(String(deadResult.payload)).toMatch(/discover|ENOENT|Is Auris running|bridge/i);
    await dead.close().catch(() => undefined);
  }, 120_000);

  it("does not leak leases across separate MCP connections", async () => {
    app = await launchBrowserResearchTestApp();
    const first = await createStdioMcpClient({
      discoveryPath: app.discoveryPath,
      name: "auris-mcp-browser-one",
    });
    const opened = await first.callTool("auris_browser", {
      action: "open",
      url: `${app.fixtureOrigin}/research-form.html`,
    });
    const control = extractControl(opened.payload);
    await first.close();

    const second = await createStdioMcpClient({
      discoveryPath: app.discoveryPath,
      name: "auris-mcp-browser-two",
    });
    client = second;
    const stolen = await second.callTool("auris_browser", {
      ...control,
      action: "read",
    });
    expect(browserErrorCode(stolen.payload)).toBe("LEASE_LOST");
  }, 120_000);
});
