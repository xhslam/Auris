import { describe, expect, it } from "vitest";
import { createBrowserReferenceContext, createNotesDocumentContext } from "@/features/nia/nia-context";
import { createNiaContextCard } from "@/features/nia/nia-context-card";
import { getNiaToolAvailability, listNiaToolsForContext, requiresNiaToolApproval } from "@/features/nia/nia-tool-registry";

describe("Nia tool registry", () => {
  it("discovers only tools compatible with the explicitly attached context", () => {
    const browser = createNiaContextCard({ context: createBrowserReferenceContext({ url: "https://example.com" }), origin: "browser" });
    const available = listNiaToolsForContext(browser).filter((tool) => tool.available).map((tool) => tool.id);
    expect(available).toContain("browser.inspect");
    expect(available).toContain("browser.control");
    expect(available).not.toContain("notes.read");
  });

  it("makes high-risk actions discoverable but never silently approved", () => {
    const note = createNiaContextCard({ context: createNotesDocumentContext({ path: "notes/a.md", source: "# A" }), origin: "note" });
    expect(getNiaToolAvailability(note, "notes.propose-edit")).toMatchObject({ available: true, approval: "per-action", risk: "high" });
    expect(requiresNiaToolApproval("browser.control")).toBe(true);
    expect(requiresNiaToolApproval("browser.inspect")).toBe(false);
  });

  it("explains why an incompatible tool is unavailable", () => {
    const browser = createNiaContextCard({ context: createBrowserReferenceContext({ url: "https://example.com" }), origin: "browser" });
    expect(getNiaToolAvailability(browser, "notes.read")).toMatchObject({ available: false, reason: expect.stringContaining("note") });
  });
});
