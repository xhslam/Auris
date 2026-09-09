import { act, renderHook } from "@testing-library/react";
import { useCompanionAvatar } from "@/components/nia/companion/use-companion-avatar";

describe("companion avatar media and motion lifecycle", () => {
  it("disconnects analysis on replacement and disposal without stopping the playback stream", () => {
    const contexts: Array<{ close: ReturnType<typeof vi.fn>; source: { disconnect: ReturnType<typeof vi.fn> }; analyser: { disconnect: ReturnType<typeof vi.fn> } }> = [];
    class Context {
      source = { connect: vi.fn(), disconnect: vi.fn() };
      analyser = { fftSize: 256, getFloatTimeDomainData: vi.fn(), disconnect: vi.fn() };
      close = vi.fn(async () => undefined);
      resume = vi.fn(async () => undefined);
      constructor() { contexts.push(this); }
      createMediaStreamSource() { return this.source; }
      createAnalyser() { return this.analyser; }
    }
    vi.stubGlobal("AudioContext", Context);
    try {
      const hook = renderHook(() => useCompanionAvatar("speaking", true));
      const stop = vi.fn();
      const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
      const audio = document.createElement("audio");
      act(() => hook.result.current.connectAudio(stream, audio));
      act(() => hook.result.current.connectAudio(stream, audio));
      expect(contexts[0].close).toHaveBeenCalledOnce();
      expect(contexts[0].source.disconnect).toHaveBeenCalledOnce();
      hook.unmount();
      expect(contexts[1].close).toHaveBeenCalledOnce();
      expect(contexts[1].analyser.disconnect).toHaveBeenCalledOnce();
      expect(stop).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("suppresses looping motion when drift is disabled while retaining an explicit nod", () => {
    const hook = renderHook(() => useCompanionAvatar("listening", false));
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    const rig = document.createElement("div");
    Object.assign(rig, { animate });
    hook.result.current.rigRef.current = rig;
    act(() => hook.result.current.playMotion("sway"));
    expect(animate).not.toHaveBeenCalled();
    act(() => hook.result.current.playMotion("nod"));
    expect(animate).toHaveBeenCalledOnce();
    hook.unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
