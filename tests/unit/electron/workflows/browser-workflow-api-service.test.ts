import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserWorkflowApiService } = require("../../../../electron/workflows/browser-workflow-api-service.cjs");

describe("browser workflow API service", () => {
  it("allows bounded credential-free HTTPS reads without ambient cookies", async () => {
    const authorize = vi.fn(async () => ({ allowed: true }));
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const service = createBrowserWorkflowApiService({
      authorize,
      fetchImpl,
      navigationPolicy: { resolveDestination: async () => ({ allowed: true }) },
    });
    const result = await service.execute({ connectionId: "workflow:1", method: "GET", url: "https://api.example.com/data" });
    expect(result.text).toBe("ok");
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ operation: "read", method: "GET" }));
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example.com/data", expect.objectContaining({ credentials: "omit", redirect: "manual" }));
  });

  it("rejects unsafe destinations and marks aborted writes as unknown outcome", async () => {
    const service = createBrowserWorkflowApiService({
      authorize: async () => ({ allowed: true }),
      fetchImpl: async (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
      navigationPolicy: { resolveDestination: async () => ({ allowed: true }) },
      timeoutMs: 5,
    });
    await expect(service.execute({ connectionId: "workflow:1", method: "GET", url: "http://example.com" })).rejects.toMatchObject({ code: "DESTINATION_NOT_ALLOWED" });
    await expect(service.execute({ connectionId: "workflow:1", method: "POST", url: "https://example.com", body: "x" })).rejects.toMatchObject({ code: "UNKNOWN_OUTCOME" });
  });
});
