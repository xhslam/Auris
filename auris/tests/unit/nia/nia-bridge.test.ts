import { describe, expect, it, vi } from "vitest";

import {
  createNiaBridge,
  getNiaBridge,
  type NiaNativeBridge,
  type NiaProviderEvent,
} from "@/features/nia/nia-bridge";

function createNative() {
  const listeners = new Set<(event: NiaProviderEvent) => void>();
  const invoke = vi.fn(async (
    command: string,
    payload?: Readonly<Record<string, unknown>>,
  ) => ({ command, payload }));
  const native: NiaNativeBridge = {
    invoke,
    subscribe: vi.fn((listener) => {
      listeners.add(listener);
      return true;
    }),
    unsubscribe: vi.fn((listener) => listeners.delete(listener)),
  };
  return { invoke, listeners, native };
}

describe("Nia renderer bridge", () => {
  it("exposes only typed provider commands and never supplies renderer ownership", async () => {
    const fixture = createNative();
    const bridge = createNiaBridge(fixture.native);

    await bridge.start({ prompt: "hello", providerId: "p1" });
    await bridge.cancel({ runId: "r1" });
    await bridge.getRun({ runId: "r1" });
    await bridge.listProviders();

    expect(fixture.invoke).toHaveBeenNthCalledWith(1, "start", {
      prompt: "hello",
      providerId: "p1",
    });
    expect(JSON.stringify(fixture.invoke.mock.calls)).not.toContain(
      "ownerWebContentsId",
    );
  });

  it("exposes provider configuration commands without ownership fields", async () => {
    const fixture = createNative();
    const bridge = createNiaBridge(fixture.native);
    await bridge.upsertRestProvider({ id: "p1", kind: "rest" });
    await bridge.setSessionApiKey({ providerId: "p1", apiKey: "sk" });
    await bridge.rememberOnThisMac({ providerId: "p1", remember: true });
    await bridge.setActiveDefault({ providerId: "p1" });
    expect(fixture.invoke).toHaveBeenCalledWith("upsertRestProvider", { id: "p1", kind: "rest" });
    expect(fixture.invoke).toHaveBeenCalledWith("setSessionApiKey", { providerId: "p1", apiKey: "sk" });
    expect(fixture.invoke).toHaveBeenCalledWith("rememberOnThisMac", { providerId: "p1", remember: true });
    expect(fixture.invoke).toHaveBeenCalledWith("setActiveDefault", { providerId: "p1" });
  });

  it("returns an unsubscribe cleanup and resolves either narrow preload host", () => {
    const fixture = createNative();
    const bridge = getNiaBridge({ shadowingDesktop: { nia: fixture.native } });
    expect(bridge).not.toBeNull();

    const listener = vi.fn();
    const cleanup = bridge!.subscribe(listener);
    expect(fixture.native.subscribe).toHaveBeenCalledWith(listener);
    expect(cleanup()).toBe(true);
    expect(fixture.native.unsubscribe).toHaveBeenCalledWith(listener);

    expect(getNiaBridge({ aurisNia: fixture.native })).not.toBeNull();
    expect(getNiaBridge({ shadowingDesktop: {} })).toBeNull();
  });
});
