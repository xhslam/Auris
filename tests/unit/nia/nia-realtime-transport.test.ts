import { describe, expect, it, vi } from "vitest";
import {
  NIA_REALTIME_MICROPHONE_CONSTRAINTS,
  NiaRealtimeTransport,
  type CompanionBridge,
  type CompanionTransportReport,
} from "@/components/nia/companion/realtime-transport";

type TransportHarness = {
  channel: { readyState: string; send: (value: string) => void };
  sendSessionUpdate: () => void;
  generation: number;
  handlers: { report: (report: CompanionTransportReport) => void; playAudio: () => void };
  handleServerEvent: (raw: string) => void;
  sessionId: string;
};

function setup() {
  const reports: CompanionTransportReport[] = [];
  const transport = new NiaRealtimeTransport();
  const harness = transport as unknown as TransportHarness;
  harness.generation = 7;
  harness.sessionId = "session-7";
  harness.handlers = { report: (report) => reports.push(report), playAudio: vi.fn() };
  return { harness, reports, transport };
}

describe("Nia Realtime transport event wiring", () => {
  it("advertises the review tool and returns fresh tool output before continuing the response", () => {
    const { harness, transport } = setup();
    const send = vi.fn();
    harness.channel = { readyState: "open", send };
    harness.sendSessionUpdate();
    expect(JSON.parse(send.mock.calls[0][0]).session).toMatchObject({ tool_choice: "auto", tools: [{ name: "get_today_reviews" }] });
    send.mockClear();
    const call = JSON.stringify({ type: "response.function_call_arguments.done", name: "get_today_reviews", call_id: "call-1", arguments: "{}" });
    harness.handleServerEvent(call);
    harness.handleServerEvent(call);
    expect(send).toHaveBeenCalledTimes(1);
    const output = JSON.parse(send.mock.calls[0][0]);
    expect(output.item).toMatchObject({ type: "function_call_output", call_id: "call-1" });
    expect(JSON.parse(output.item.output)).toMatchObject({ status: "ready", actionableCount: 0 });
    harness.handleServerEvent(JSON.stringify({ type: "response.done" }));
    expect(JSON.parse(send.mock.calls[1][0])).toEqual({ type: "response.create" });
    send.mockClear();
    transport.sendReminder({ count: 1, items: [{ title: "特征值", projectName: "数学" }] });
    expect(JSON.parse(send.mock.calls[0][0]).item.content[0].text).toContain("特征值");
  });

  it("opens only after configuration confirmation and files a natural assistant turn", () => {
    const { harness, reports } = setup();
    harness.handleServerEvent(JSON.stringify({ type: "session.updated" }));
    harness.handleServerEvent(JSON.stringify({ type: "response.output_item.added", response_id: "response-1", item: { id: "item-1" } }));
    harness.handleServerEvent(JSON.stringify({
      type: "response.output_audio_transcript.done",
      response_id: "response-1",
      item_id: "item-1",
      transcript: "已经帮你记下来了。",
    }));
    expect(reports.some((report) => report.type === "said")).toBe(false);
    harness.handleServerEvent(JSON.stringify({ type: "output_audio_buffer.stopped", response_id: "response-1" }));

    expect(reports).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "opened", generation: 7, sessionId: "session-7" }),
      expect.objectContaining({ type: "said", generation: 7, text: "已经帮你记下来了。", cut: false }),
    ]));
  });

  it("flushes a transcript before acknowledging close", () => {
    const { harness, reports, transport } = setup();
    harness.handleServerEvent(JSON.stringify({ type: "response.output_item.added", response_id: "response-2", item: { id: "item-2" } }));
    harness.handleServerEvent(JSON.stringify({
      type: "response.output_audio_transcript.done",
      response_id: "response-2",
      item_id: "item-2",
      transcript: "最后一句。",
    }));
    transport.close(7);

    const filedAt = reports.findIndex((report) => report.type === "said");
    const closedAt = reports.findIndex((report) => report.type === "closed");
    expect(filedAt).toBeGreaterThanOrEqual(0);
    expect(closedAt).toBeGreaterThan(filedAt);
  });

  it("lets an overlapping open clean up only its own microphone and peer", async () => {
    const originalBridge = window.niaCompanion;
    const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    const tracks = [
      { enabled: true, stop: vi.fn() },
      { enabled: true, stop: vi.fn() },
    ];
    const streams = tracks.map((track) => ({
      getAudioTracks: () => [track],
      getTracks: () => [track],
    }) as unknown as MediaStream);
    const resolvers: Array<(stream: MediaStream) => void> = [];
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => resolvers.push(resolve)));
    const peers: Array<{ closed: boolean }> = [];
    const addTrack = vi.fn();

    class PeerMock {
      iceGatheringState: RTCIceGatheringState = "complete";
      connectionState: RTCPeerConnectionState = "new";
      localDescription: RTCSessionDescription | null = { type: "offer", sdp: "offer" } as RTCSessionDescription;
      onconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
      ontrack: ((this: RTCPeerConnection, ev: RTCTrackEvent) => unknown) | null = null;
      closed = false;
      constructor() { peers.push(this); }
      addEventListener() {}
      removeEventListener() {}
      addTrack(track: MediaStreamTrack, stream: MediaStream) { addTrack(track, stream); }
      addTransceiver() {}
      createDataChannel() { return { readyState: "open", send: vi.fn(), close: vi.fn(), onmessage: null, onopen: null } as unknown as RTCDataChannel; }
      async createOffer() { return { type: "offer", sdp: "offer" } as RTCSessionDescriptionInit; }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      close() { this.closed = true; }
    }

    let session = 0;
    const bridge = {
      openSession: vi.fn(async () => ({ ok: true, sessionId: `session-${++session}`, expiresAt: null })),
      sdp: vi.fn(async () => ({ ok: true, answer: "answer" })),
      report: vi.fn(() => true),
    } as unknown as CompanionBridge;
    Object.defineProperty(window, "niaCompanion", { configurable: true, value: bridge });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    vi.stubGlobal("RTCPeerConnection", PeerMock);
    const transport = new NiaRealtimeTransport();
    const handlers = { report: vi.fn(), playAudio: vi.fn() };

    try {
      const firstOpen = transport.open(1, handlers);
      await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
      const secondOpen = transport.open(2, handlers);
      await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));

      expect(getUserMedia).toHaveBeenNthCalledWith(1, {
        audio: NIA_REALTIME_MICROPHONE_CONSTRAINTS,
      });
      expect(getUserMedia).toHaveBeenNthCalledWith(2, {
        audio: NIA_REALTIME_MICROPHONE_CONSTRAINTS,
      });

      resolvers[1]?.(streams[1]);
      await expect(secondOpen).resolves.toBe(true);
      resolvers[0]?.(streams[0]);
      await expect(firstOpen).resolves.toBe(false);

      expect(peers).toHaveLength(1);
      expect(peers[0]?.closed).toBe(false);
      expect(addTrack).toHaveBeenCalledWith(tracks[1], streams[1]);
      expect(tracks[0].stop).toHaveBeenCalledOnce();
      expect(tracks[1].stop).not.toHaveBeenCalled();
    } finally {
      transport.close();
      vi.unstubAllGlobals();
      Object.defineProperty(window, "niaCompanion", { configurable: true, value: originalBridge });
      if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
      else Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });
});
