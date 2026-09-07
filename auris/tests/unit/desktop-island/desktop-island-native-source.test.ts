import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(
    process.cwd(),
    "native",
    "desktop-island",
    "macos",
    "AurisDesktopIslandHelper.swift",
  ),
  "utf8",
);

describe("desktop island native click-away behavior", () => {
  it("observes both app-local and global mouse clicks without intercepting them", () => {
    expect(source).toContain("NSEvent.addGlobalMonitorForEvents");
    expect(source).toContain("NSEvent.addLocalMonitorForEvents");
    expect(source).toContain("return event");
  });

  it("collapses only an expanded panel when the click is outside its actual frame", () => {
    expect(source).toContain('controller.model.presentation == "expanded"');
    expect(source).toContain("!collapseRequested");
    expect(source).toContain("!controller.panel.frame.contains(NSEvent.mouseLocation)");
    expect(source).toContain('emit(["action": "set-expanded", "value": false])');
  });

  it("removes event monitors when the helper terminates", () => {
    expect(source).toContain("applicationWillTerminate");
    expect(source).toContain("NSEvent.removeMonitor(globalMouseMonitor)");
    expect(source).toContain("NSEvent.removeMonitor(localMouseMonitor)");
  });

  it("drags and snaps to the midpoint of the nearest screen edge", () => {
    expect(source).toContain("panel.isMovable = true");
    expect(source).toContain("panel.isMovableByWindowBackground = true");
    expect(source).toContain("func snapAfterDrag()");
    expect(source).toContain("IslandPlacement.allCases.min");
    expect(source).toContain('emit(["action": "set-placement", "value": placement.rawValue])');
    for (const placement of [".top", ".right", ".bottom", ".left"]) {
      expect(source).toContain(`case ${placement}`);
    }
  });
});
