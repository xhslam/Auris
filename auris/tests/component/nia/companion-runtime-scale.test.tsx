import { sendNiaAvatarCue } from "@/features/nia/nia-avatar-behavior";
import { NIA_COMPANION_DRIFT_KEY, saveNiaCompanionDrift } from "@/features/nia/nia-companion-motion";
import { act, fireEvent, render } from "@testing-library/react";
import { CompanionRuntime } from "@/components/nia/companion/companion-runtime";
import {
  NIA_COMPANION_SCALE_STORAGE_KEY,
  saveNiaCompanionScale,
} from "@/features/nia/nia-companion-scale";

describe("CompanionRuntime scale", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.niaCompanion;
  });

  it("shows anger, lets a newer expression replace its timeout, and returns to sleep", () => {
    vi.useFakeTimers();
    try {
      const view = render(<CompanionRuntime />);
      const figure = view.container.querySelector(".nia-companion__figure");
      expect(figure).toHaveAttribute("data-expression", "sleepy");
      act(() => sendNiaAvatarCue({ expression: "angry" }));
      expect(figure).toHaveAttribute("data-expression", "angry");
      expect(figure).toHaveAttribute("data-asleep", "false");
      act(() => vi.advanceTimersByTime(3000));
      act(() => sendNiaAvatarCue({ expression: "happy" }));
      act(() => vi.advanceTimersByTime(2100));
      expect(figure).toHaveAttribute("data-expression", "happy");
      act(() => vi.advanceTimersByTime(3000));
      expect(figure).toHaveAttribute("data-expression", "sleepy");
      view.unmount();
    } finally { vi.useRealTimers(); }
  });

  it("restores drift and follows both same-window and cross-window preference changes", () => {
    saveNiaCompanionDrift(false);
    const { container } = render(<CompanionRuntime />);
    const figure = container.querySelector(".nia-companion__figure");
    expect(figure).toHaveAttribute("data-drift", "false");
    act(() => saveNiaCompanionDrift(true));
    expect(figure).toHaveAttribute("data-drift", "true");
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: NIA_COMPANION_DRIFT_KEY, newValue: "false",
    })));
    expect(figure).toHaveAttribute("data-drift", "false");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(figure).toHaveAttribute("data-drift", "true");
  });

  it("still changes drift when persistence is unavailable", () => {
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    try {
      const { container } = render(<CompanionRuntime />);
      act(() => saveNiaCompanionDrift(false));
      expect(container.querySelector(".nia-companion__figure")).toHaveAttribute("data-drift", "false");
    } finally { storage.mockRestore(); }
  });

  it("scales only the companion figure and follows persisted changes", () => {
    saveNiaCompanionScale(70);
    const { container } = render(<CompanionRuntime />);
    const root = container.querySelector(".nia-companion") as HTMLElement;
    const figure = container.querySelector(".nia-companion__figure") as HTMLElement;

    expect(figure.style.getPropertyValue("--nia-companion-scale")).toBe("0.7");
    expect(root.style.getPropertyValue("--nia-companion-scale")).toBe("");

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: NIA_COMPANION_SCALE_STORAGE_KEY,
        newValue: "115",
      }));
    });

    expect(figure.style.getPropertyValue("--nia-companion-scale")).toBe("1.15");
    expect(root.style.getPropertyValue("--nia-companion-scale")).toBe("");
  });

  it("captures the pointer only over Nia's visible body, leaving transparent window space click-through", () => {
    const bridge = {
      ready: vi.fn(() => true),
      subscribe: vi.fn(() => true),
      unsubscribe: vi.fn(() => true),
      openSession: vi.fn(),
      sdp: vi.fn(),
      report: vi.fn(() => true),
      pointerCapture: vi.fn(async () => true),
      dragBegin: vi.fn(async () => true),
      dragTo: vi.fn(async () => true),
      dragEnd: vi.fn(async () => true),
      openNia: vi.fn(async () => true),
      wake: vi.fn(async () => true),
      showMenu: vi.fn(async () => true),
    };
    window.niaCompanion = bridge;

    const { container } = render(<CompanionRuntime />);
    const root = container.querySelector(".nia-companion") as HTMLElement;
    const head = container.querySelector(".nia-companion__head") as HTMLElement;

    fireEvent.pointerMove(root);
    expect(bridge.pointerCapture).not.toHaveBeenCalled();

    fireEvent.pointerMove(head);
    expect(bridge.pointerCapture).toHaveBeenLastCalledWith(true);

    fireEvent.pointerMove(root);
    expect(bridge.pointerCapture).toHaveBeenLastCalledWith(false);
  });

  it("does not wake or drag Nia when a pointer press lands in transparent window space", () => {
    const bridge = {
      ready: vi.fn(() => true),
      subscribe: vi.fn(() => true),
      unsubscribe: vi.fn(() => true),
      openSession: vi.fn(),
      sdp: vi.fn(),
      report: vi.fn(() => true),
      pointerCapture: vi.fn(async () => true),
      dragBegin: vi.fn(async () => true),
      dragTo: vi.fn(async () => true),
      dragEnd: vi.fn(async () => true),
      openNia: vi.fn(async () => true),
      wake: vi.fn(async () => true),
      showMenu: vi.fn(async () => true),
    };
    window.niaCompanion = bridge;

    const { container } = render(<CompanionRuntime />);
    const root = container.querySelector(".nia-companion") as HTMLElement;
    const body = container.querySelector(".nia-companion__body") as HTMLElement;

    fireEvent.pointerDown(root, { button: 0, pointerId: 1, screenX: 20, screenY: 20 });
    expect(bridge.wake).not.toHaveBeenCalled();
    expect(bridge.dragBegin).not.toHaveBeenCalled();

    fireEvent.pointerDown(body, { button: 0, pointerId: 2, screenX: 160, screenY: 260 });
    expect(bridge.wake).toHaveBeenCalledTimes(1);
    expect(bridge.dragBegin).toHaveBeenCalledTimes(1);
  });

  it("retains pointer capture upon pointer release on Nia's body and allows immediate right-click menu", async () => {
    const bridge = {
      ready: vi.fn(() => true),
      subscribe: vi.fn(() => true),
      unsubscribe: vi.fn(() => true),
      openSession: vi.fn(),
      sdp: vi.fn(),
      report: vi.fn(() => true),
      pointerCapture: vi.fn(async () => true),
      dragBegin: vi.fn(async () => true),
      dragTo: vi.fn(async () => true),
      dragEnd: vi.fn(async () => true),
      openNia: vi.fn(async () => true),
      wake: vi.fn(async () => true),
      showMenu: vi.fn(async () => true),
    };
    window.niaCompanion = bridge;

    const { container } = render(<CompanionRuntime />);
    const body = container.querySelector(".nia-companion__body") as HTMLElement;

    // Pointer down on body starts drag
    fireEvent.pointerDown(body, { button: 0, pointerId: 1, clientX: 160, clientY: 260, screenX: 160, screenY: 260 });
    expect(bridge.dragBegin).toHaveBeenCalledTimes(1);

    // Pointer up on body releases drag with retainCapture: true
    fireEvent.pointerUp(body, { button: 0, pointerId: 1, clientX: 160, clientY: 260, screenX: 160, screenY: 260 });
    expect(bridge.dragEnd).toHaveBeenCalledWith({ retainCapture: true });

    // Immediate right-click in place triggers showMenu
    fireEvent.contextMenu(body, { clientX: 160, clientY: 260 });
    expect(bridge.showMenu).toHaveBeenCalledTimes(1);
  });

  it("releases pointer capture when pointer is released outside Nia's body", async () => {
    const bridge = {
      ready: vi.fn(() => true),
      subscribe: vi.fn(() => true),
      unsubscribe: vi.fn(() => true),
      openSession: vi.fn(),
      sdp: vi.fn(),
      report: vi.fn(() => true),
      pointerCapture: vi.fn(async () => true),
      dragBegin: vi.fn(async () => true),
      dragTo: vi.fn(async () => true),
      dragEnd: vi.fn(async () => true),
      openNia: vi.fn(async () => true),
      wake: vi.fn(async () => true),
      showMenu: vi.fn(async () => true),
    };
    window.niaCompanion = bridge;

    const { container } = render(<CompanionRuntime />);
    const root = container.querySelector(".nia-companion") as HTMLElement;
    const body = container.querySelector(".nia-companion__body") as HTMLElement;

    // Pointer down on body starts drag
    fireEvent.pointerDown(body, { button: 0, pointerId: 1, clientX: 160, clientY: 260, screenX: 160, screenY: 260 });
    expect(bridge.dragBegin).toHaveBeenCalledTimes(1);

    // Pointer up released over root (transparent area)
    fireEvent.pointerUp(root, { button: 0, pointerId: 1, clientX: 20, clientY: 20, screenX: 20, screenY: 20 });
    expect(bridge.dragEnd).toHaveBeenCalledWith({ retainCapture: false });
    expect(bridge.pointerCapture).toHaveBeenLastCalledWith(false);
  });

  it("recovers from lost pointer capture and detects mouse button release during drag", async () => {
    const bridge = {
      ready: vi.fn(() => true),
      subscribe: vi.fn(() => true),
      unsubscribe: vi.fn(() => true),
      openSession: vi.fn(),
      sdp: vi.fn(),
      report: vi.fn(() => true),
      pointerCapture: vi.fn(async () => true),
      dragBegin: vi.fn(async () => true),
      dragTo: vi.fn(async () => true),
      dragEnd: vi.fn(async () => true),
      openNia: vi.fn(async () => true),
      wake: vi.fn(async () => true),
      showMenu: vi.fn(async () => true),
    };
    window.niaCompanion = bridge;

    const { container } = render(<CompanionRuntime />);
    const root = container.querySelector(".nia-companion") as HTMLElement;
    const body = container.querySelector(".nia-companion__body") as HTMLElement;

    // Start drag
    fireEvent.pointerDown(body, { button: 0, pointerId: 1, clientX: 160, clientY: 260, screenX: 160, screenY: 260 });
    expect(root.getAttribute("data-dragging")).toBe("true");

    // Moving with buttons: 0 means mouse button was released without pointerup
    fireEvent.pointerMove(body, { buttons: 0, clientX: 165, clientY: 265, screenX: 165, screenY: 265 });
    expect(bridge.dragEnd).toHaveBeenCalledTimes(1);
    expect(root.getAttribute("data-dragging")).toBe("false");

    // Start drag again
    fireEvent.pointerDown(body, { button: 0, pointerId: 2, clientX: 160, clientY: 260, screenX: 160, screenY: 260 });
    expect(root.getAttribute("data-dragging")).toBe("true");

    // lostpointercapture fires
    fireEvent.lostPointerCapture(root);
    expect(bridge.dragEnd).toHaveBeenCalledTimes(2);
    expect(root.getAttribute("data-dragging")).toBe("false");
  });

  it("continuously re-evaluates hit target via animation frame while pointer is stationary", () => {
    const bridge = {
      ready: vi.fn(() => true),
      subscribe: vi.fn(() => true),
      unsubscribe: vi.fn(() => true),
      openSession: vi.fn(),
      sdp: vi.fn(),
      report: vi.fn(() => true),
      pointerCapture: vi.fn(async () => true),
      dragBegin: vi.fn(async () => true),
      dragTo: vi.fn(async () => true),
      dragEnd: vi.fn(async () => true),
      openNia: vi.fn(async () => true),
      wake: vi.fn(async () => true),
      showMenu: vi.fn(async () => true),
    };
    window.niaCompanion = bridge;

    let rAFCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rAFCallback = cb;
      return 123;
    });

    const { container } = render(<CompanionRuntime />);
    const root = container.querySelector(".nia-companion") as HTMLElement;
    const head = container.querySelector(".nia-companion__head") as HTMLElement;

    // Pointer move over head
    fireEvent.pointerMove(head, { clientX: 160, clientY: 80 });
    expect(bridge.pointerCapture).toHaveBeenLastCalledWith(true);
    bridge.pointerCapture.mockClear();

    // Now simulate mock elementFromPoint returning root (e.g. figure animated away)
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => root);

    act(() => {
      rAFCallback?.(performance.now());
    });

    expect(bridge.pointerCapture).toHaveBeenLastCalledWith(false);

    // Restore
    document.elementFromPoint = originalElementFromPoint;
  });
});
