import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production browser approval wiring", () => {
  it("creates one main-owned authority and injects it into chrome IPC", () => {
    const source = readFileSync(resolve(process.cwd(), "electron/main.cjs"), "utf8");
    const grantsCreation = source.indexOf("browserGrantManager = createBrowserGrantManager()");
    const creation = source.indexOf(
      "browserApprovalManager = createBrowserApprovalManager({ grants: browserGrantManager })",
    );
    const injection = source.indexOf("approvalAuthority: browserApprovalManager");
    const grantsIpc = source.indexOf("grantAuthority: browserGrantManager");

    expect(grantsCreation).toBeGreaterThan(0);
    expect(creation).toBeGreaterThan(grantsCreation);
    expect(injection).toBeGreaterThan(creation);
    expect(grantsIpc).toBeGreaterThan(creation);
    expect(source).toContain("let browserApprovalManager = null;");
    expect(source).toContain("let browserGrantManager = null;");
  });
});
