import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserWorkflowRecorder } = require("../../../../electron/workflows/browser-workflow-recorder.cjs");

describe("browser workflow recorder", () => {
  it.each(["password", "file", "auth", "text", "search", "textarea", "contenteditable"])(
    "turns %s input into an opaque declared slot before capture",
    (inputKind) => {
      const recorder = createBrowserWorkflowRecorder();
      recorder.start();
      const event = recorder.captureTrusted({
        type: "input",
        inputKind,
        target: "Search",
        value: "never-cross-this-boundary",
        sensitive: false,
      });
      expect(event).toMatchObject({ type: "input", valueMode: "opaque_input", slot: "input_1" });
      expect(JSON.stringify(recorder.snapshot())).not.toContain("never-cross-this-boundary");
    },
  );

  it("redacts navigation credentials/query and permits literals only after explicit nonsensitive review", () => {
    const recorder = createBrowserWorkflowRecorder();
    recorder.start();
    const navigation = recorder.captureTrusted({ type: "navigation", url: "https://user:pass@example.com/path?q=secret" });
    expect(navigation.url).toBe("https://example.com/path");
    const input = recorder.captureTrusted({ type: "input", inputKind: "text", target: "Search", value: "private" });
    expect(() => recorder.approveLiteral({ eventId: input.eventId, value: "public", confirmed: false })).toThrow();
    expect(recorder.approveLiteral({ eventId: input.eventId, value: "public", confirmed: true })).toMatchObject({ literal: "public" });
    const password = recorder.captureTrusted({ type: "input", inputKind: "password", target: "Password", value: "secret" });
    expect(() => recorder.approveLiteral({ eventId: password.eventId, value: "secret", confirmed: true })).toThrow(/never/u);
  });
});
