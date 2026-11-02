import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { useNotesTerminalSessions } from "../../../src/components/notes-v2/terminal/use-notes-terminal-sessions";

describe("Terminal layout animation sizing freeze mechanism", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("provides beginLayoutAnimation and endLayoutAnimation on the sessions hook", () => {
    const { result } = renderHook(() =>
      useNotesTerminalSessions({
        enabled: false,
        terminalBridge: null,
        visible: true,
      })
    );

    expect(typeof result.current.beginLayoutAnimation).toBe("function");
    expect(typeof result.current.endLayoutAnimation).toBe("function");
  });

  it("handles nested animations and only executes post-animation fit once count reaches zero", () => {
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    const { result } = renderHook(() =>
      useNotesTerminalSessions({
        enabled: false,
        terminalBridge: null,
        visible: true,
      })
    );

    let end1!: () => void;
    let end2!: () => void;

    // Start 2 nested animations
    act(() => {
      end1 = result.current.beginLayoutAnimation(160);
      end2 = result.current.beginLayoutAnimation(160);
    });

    // While nested (count = 2), ending the first should decrement count to 1 without post-fit
    act(() => {
      end1();
    });
    expect(rafSpy).not.toHaveBeenCalled();

    // Ending the second decrements count to 0, which should schedule post-animation fit
    act(() => {
      end2();
    });
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("recovers via safety timeout (duration + 100ms) if end is never called", () => {
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    const { result } = renderHook(() =>
      useNotesTerminalSessions({
        enabled: false,
        terminalBridge: null,
        visible: true,
      })
    );

    act(() => {
      // Begin 160ms animation but deliberately omit calling end()
      result.current.beginLayoutAnimation(160);
    });

    // Before safety timeout (160 + 100 = 260ms), no post-fit
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(rafSpy).not.toHaveBeenCalled();

    // After safety timeout expires at 260ms, count is reset and post-fit runs
    act(() => {
      vi.advanceTimersByTime(70); // total 270ms > 260ms
    });
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("cleans up safety timeout on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useNotesTerminalSessions({
        enabled: false,
        terminalBridge: null,
        visible: true,
      })
    );

    act(() => {
      result.current.beginLayoutAnimation(160);
    });

    unmount();
    // Advancing timers should not throw or trigger callbacks on unmounted component
    expect(() => {
      vi.advanceTimersByTime(500);
    }).not.toThrow();
  });
});

describe("CSS Motion Tokens, Rules and Reduced-Motion Verification", () => {
  const terminalFocusCss = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/desktop/terminal-focus/terminal-focus.css"),
    "utf-8"
  );
  const readerCss = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/notes-v2/terminal/notes-terminal-reader.css"),
    "utf-8"
  );

  it("defines motion duration and easing CSS variables strictly within 120-180ms", () => {
    expect(terminalFocusCss).toContain("--auris-motion-fast: 120ms;");
    expect(terminalFocusCss).toContain("--auris-motion-base: 160ms;");
    expect(terminalFocusCss).toContain("--auris-ease: cubic-bezier(0.2, 0, 0, 1);");

    expect(readerCss).toContain("--auris-motion-fast: 120ms;");
    expect(readerCss).toContain("--auris-motion-base: 160ms;");
    expect(readerCss).toContain("--auris-ease: cubic-bezier(0.2, 0, 0, 1);");
  });

  it("implements sidebar session row enter (translateY + opacity) and exit (120ms fade)", () => {
    expect(terminalFocusCss).toContain("@keyframes auris-session-enter");
    expect(terminalFocusCss).toContain("transform: translateY(4px);");
    expect(terminalFocusCss).toContain(".terminal-focus__session-row[data-closing=\"true\"]");
    expect(terminalFocusCss).toContain("opacity: 0;");
  });

  it("implements project group collapse via grid-template-rows 0fr ↔ 1fr", () => {
    expect(terminalFocusCss).toContain(".terminal-focus__project-collapse");
    expect(terminalFocusCss).toContain("grid-template-rows: 1fr;");
    expect(terminalFocusCss).toContain(".terminal-focus__project-collapse[data-collapsed=\"true\"]");
    expect(terminalFocusCss).toContain("grid-template-rows: 0fr;");
  });

  it("implements status dot 150ms background-color transition while preserving pulse animation", () => {
    expect(terminalFocusCss).toContain("transition: background-color 150ms");
    expect(terminalFocusCss).toContain("animation: terminal-focus-pulse");
  });

  it("implements new split pane enter (120ms opacity) without transitions on separator dragging", () => {
    expect(terminalFocusCss).toContain("@keyframes auris-pane-enter");
    expect(terminalFocusCss).toContain(".terminal-focus__pane {");
    expect(terminalFocusCss).toContain("animation: auris-pane-enter");

    // Ensure separator does not have transition animation
    const separatorBlock = terminalFocusCss.slice(terminalFocusCss.indexOf(".terminal-focus__separator {"));
    expect(separatorBlock.slice(0, 200)).not.toContain("transition:");
  });

  it("implements single-pane active switch 100ms fade in", () => {
    expect(terminalFocusCss).toContain("@keyframes auris-pane-fade-in");
    expect(terminalFocusCss).toContain(".terminal-focus__grid[data-single-pane=\"true\"] .terminal-focus__pane[data-active=\"true\"]");
    expect(terminalFocusCss).toContain("animation: auris-pane-fade-in 100ms");
  });

  it("implements reading mode overlay 120ms enter and exit transitions", () => {
    expect(readerCss).toContain("@keyframes auris-reader-fade-in");
    expect(readerCss).toContain("animation: auris-reader-fade-in var(--auris-motion-fast, 120ms)");
    expect(readerCss).toContain(".terminal-reader[data-exiting=\"true\"]");
    expect(readerCss).toContain("transition: opacity var(--auris-motion-fast, 120ms)");
  });

  it("implements sidebar overall collapse transition with 160ms ease", () => {
    expect(terminalFocusCss).toContain("transition: grid-template-columns var(--auris-motion-base, 160ms)");
  });

  it("does not use 'transition: all' in animation definitions", () => {
    // Avoid blanket transition: all
    expect(terminalFocusCss).not.toContain("transition: all;");
    expect(terminalFocusCss).not.toContain("transition: all ");
    expect(readerCss).not.toContain("transition: all;");
    expect(readerCss).not.toContain("transition: all ");
  });

  it("honors prefers-reduced-motion: reduce by disabling all animations and transitions", () => {
    expect(terminalFocusCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(readerCss).toContain("@media (prefers-reduced-motion: reduce)");

    expect(terminalFocusCss).toContain("--auris-motion-fast: 0ms !important;");
    expect(terminalFocusCss).toContain("animation: none !important;");
    expect(terminalFocusCss).toContain("transition: none !important;");

    expect(readerCss).toContain("--auris-motion-fast: 0ms !important;");
    expect(readerCss).toContain("animation: none !important;");
    expect(readerCss).toContain("transition: none !important;");
  });
});
