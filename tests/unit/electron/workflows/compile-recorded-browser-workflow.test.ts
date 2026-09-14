import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserWorkflowRecorder } = require(
  "../../../../electron/workflows/browser-workflow-recorder.cjs",
);
const { compileRecordedBrowserWorkflow } = require(
  "../../../../electron/workflows/compile-recorded-browser-workflow.cjs",
);
const { compileBrowserWorkflowFromSource } = require(
  "../../../../electron/shared/browser-workflow-contract.cjs",
);

describe("compile recorded browser workflow", () => {
  it("emits opaque input slots and confirm before sensitive clicks", () => {
    const recorder = createBrowserWorkflowRecorder({
      randomBytes: () => Buffer.alloc(8, 3),
    });
    recorder.start();
    recorder.captureTrusted({
      type: "navigation",
      url: "https://example.com/search",
    });
    recorder.captureTrusted({
      type: "input",
      inputKind: "search",
      target: "q",
      descriptor: "Search box",
    });
    recorder.captureTrusted({
      type: "action",
      action: "click",
      target: "Search",
    });
    const snapshot = recorder.stop();
    const source = compileRecordedBrowserWorkflow(snapshot);
    expect(source).toContain("site: example.com");
    expect(source).toContain("input_1:");
    expect(source).toContain("type: text");
    expect(source).toContain('type {input_1} into "q"');
    expect(source).toContain('click "Search"');
    expect(source).toContain('confirm: Allow click "Search"?');
    expect(source).not.toMatch(/password|secret-value/iu);

    const compiled = compileBrowserWorkflowFromSource(source);
    expect(compiled.site).toBe("example.com");
    expect(compiled.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("inserts confirm before secret input slots", () => {
    const recorder = createBrowserWorkflowRecorder({
      randomBytes: () => Buffer.alloc(8, 7),
    });
    recorder.start();
    recorder.captureTrusted({
      type: "navigation",
      url: "https://example.com/login",
    });
    recorder.captureTrusted({
      type: "input",
      inputKind: "password",
      target: "password",
      descriptor: "Password",
    });
    const snapshot = recorder.stop();
    const source = compileRecordedBrowserWorkflow(snapshot);
    expect(source).toContain("type: secret");
    expect(source).toContain('confirm: Allow secret input into "password"?');
    expect(source).toContain('type {input_1} into "password"');
    expect(() => compileBrowserWorkflowFromSource(source)).not.toThrow();
  });
});
