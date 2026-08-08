import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FloatingWordCard } from "@/components/workspace/floating-word-card";

afterEach(() => {
  cleanup();
});

describe("FloatingWordCard", () => {
  it("uses an explicit portal target for fullscreen top-layer content", () => {
    const fullscreenSurface = document.createElement("div");
    document.body.append(fullscreenSurface);

    render(
      <FloatingWordCard
        anchor={{ x: 120, y: 80 }}
        onClose={vi.fn()}
        placementKey="fullscreen:120:80"
        portalTarget={fullscreenSurface}
      >
        <div data-word-card-drag-handle="">fullscreen word</div>
      </FloatingWordCard>,
    );

    expect(
      fullscreenSurface.contains(screen.getByLabelText("Word definition")),
    ).toBe(true);

    fullscreenSurface.remove();
  });

  it("keeps a single portaled card and replaces placement for a new word", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <FloatingWordCard
        anchor={{ x: 120, y: 80 }}
        onClose={onClose}
        placementKey="hello:120:80"
      >
        <div data-word-card-drag-handle="">
          <h2>hello</h2>
        </div>
      </FloatingWordCard>,
    );

    expect(screen.getAllByLabelText("Word definition")).toHaveLength(1);
    expect(document.body.querySelectorAll("[data-open='true']")).toHaveLength(1);

    rerender(
      <FloatingWordCard
        anchor={{ x: 400, y: 200 }}
        onClose={onClose}
        placementKey="world:400:200"
      >
        <div data-word-card-drag-handle="">
          <h2>world</h2>
        </div>
      </FloatingWordCard>,
    );

    expect(screen.getByText("world")).toBeTruthy();
    expect(screen.queryByText("hello")).toBeNull();
    expect(document.body.querySelectorAll("[data-open='true']")).toHaveLength(1);
  });

  it("closes on outside pointerdown and Escape, but not on card clicks", () => {
    const onClose = vi.fn();
    render(
      <div>
        <button type="button">outside</button>
        <FloatingWordCard
          anchor={{ x: 140, y: 100 }}
          onClose={onClose}
          placementKey="alpha:140:100"
        >
          <div data-word-card-drag-handle="">
            <h2>alpha</h2>
            <button type="button">inside</button>
          </div>
        </FloatingWordCard>
      </div>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "inside" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }), {
      bubbles: true,
    });
    // Capture-phase listener is on document; Testing Library's fireEvent
    // still reaches document listeners registered with capture=true.
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("starts dragging from the title handle and stays inside the viewport", () => {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);

    const onClose = vi.fn();
    render(
      <FloatingWordCard
        anchor={{ x: 100, y: 80 }}
        onClose={onClose}
        placementKey="drag:100:80"
        style={{ width: 200, height: 120 }}
      >
        <div data-word-card-drag-handle="">
          <h2>drag-me</h2>
        </div>
      </FloatingWordCard>,
    );

    const card = screen.getByLabelText("Word definition");
    Object.defineProperty(card, "offsetWidth", { configurable: true, value: 200 });
    Object.defineProperty(card, "offsetHeight", { configurable: true, value: 120 });

    const handle = screen.getByText("drag-me");

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 150,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(card, {
      clientX: 500,
      clientY: 350,
      pointerId: 1,
    });
    fireEvent.pointerUp(card, { pointerId: 1 });

    const nextLeft = Number.parseFloat(card.style.left);
    const nextTop = Number.parseFloat(card.style.top);

    expect(card.getAttribute("data-dragging")).toBe("false");
    expect(nextLeft).toBeGreaterThanOrEqual(12);
    expect(nextTop).toBeGreaterThanOrEqual(12);
    expect(nextLeft + 200).toBeLessThanOrEqual(1000 - 12);
    expect(nextTop + 120).toBeLessThanOrEqual(800 - 12);
    expect(onClose).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("constrains the visual surface when loaded content grows", () => {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 600);

    render(
      <FloatingWordCard
        anchor={{ x: 390, y: 398 }}
        onClose={vi.fn()}
        placementKey="growing:390:398"
      >
        <div style={{ height: 900 }}>long definition</div>
      </FloatingWordCard>,
    );

    const card = screen.getByLabelText("Word definition");
    const surface = card.querySelector(
      ".floating-word-card__surface",
    ) as HTMLElement | null;

    expect(surface).not.toBeNull();
    expect(Number.parseFloat(surface!.style.maxHeight)).toBeLessThanOrEqual(576);

    vi.unstubAllGlobals();
  });
});
