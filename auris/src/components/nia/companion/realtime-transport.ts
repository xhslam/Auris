"use client";

export type CompanionTransportReport =
  | { type: "opened"; generation: number; sessionId: string; expiresAt: number | null }
  | { type: "state"; generation: number; state: string }
  | { type: "heard" | "said"; generation: number; text: string; responseId?: string; itemId?: string; cut?: boolean }
  | { type: "tool"; generation: number; name: string; callId: string; status?: string }
  | { type: "failed"; generation: number; code: string; message: string; recovery?: string }
  | { type: "closed"; generation: number };

export type CompanionBridge = {
  ready: (payload?: Record<string, unknown>) => boolean;
  subscribe: (listener: (command: unknown) => void) => boolean;
  unsubscribe: (listener: (command: unknown) => void) => boolean;
  openSession: () => Promise<{ ok: boolean; sessionId?: string; expiresAt?: number | null; error?: { code?: string; message?: string; recovery?: string } }>;
  sdp: (sessionId: string, offer: string) => Promise<{ ok: boolean; answer?: string; error?: { code?: string; message?: string; recovery?: string } }>;
  report: (report: CompanionTransportReport) => boolean;
  pointerCapture: (enabled: boolean) => Promise<unknown>;
  dragBegin: (x: number, y: number) => Promise<unknown>;
  dragTo: (x: number, y: number) => Promise<unknown>;
  dragEnd: () => Promise<unknown>;
  openNia: () => Promise<unknown>;
  wake: () => Promise<unknown>;
};

type TransportHandlers = {
  report: (report: CompanionTransportReport) => void;
  playAudio: (stream: MediaStream) => void;
};

declare global {
  interface Window { niaCompanion?: CompanionBridge }
}

function bridgeForWindow(): CompanionBridge | null {
  return typeof window !== "undefined" ? window.niaCompanion ?? null : null;
}

function errorReport(generation: number, code: string, message: string, recovery?: string): CompanionTransportReport {
  return { type: "failed", generation, code, message, recovery };
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }, 6_000);
    function onChange() {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }
    peer.addEventListener("icegatheringstatechange", onChange);
  });
}

export class NiaRealtimeTransport {
  private peer: RTCPeerConnection | null = null;
  private microphone: MediaStream | null = null;
  private channel: RTCDataChannel | null = null;
  private generation = 0;
  private sessionId: string | null = null;
  private handlers: TransportHandlers | null = null;

  async open(generation: number, handlers: TransportHandlers, options: { microphone?: boolean } = {}): Promise<boolean> {
    this.close(generation, false);
    this.generation = generation;
    this.handlers = handlers;
    const bridge = bridgeForWindow();
    const microphone = options.microphone !== false;
    if (!bridge || typeof RTCPeerConnection === "undefined" || (microphone && !navigator.mediaDevices?.getUserMedia)) {
      this.emit(errorReport(generation, "REALTIME_UNSUPPORTED", "This companion cannot start local Realtime audio.", "Use a recent Auris desktop build, then wake Nia again."));
      return false;
    }
    let session: Awaited<ReturnType<CompanionBridge["openSession"]>> | null = null;
    try {
      session = await bridge.openSession();
    } catch (cause) {
      this.emit(errorReport(generation, "CODEX_SESSION_UNAVAILABLE", cause instanceof Error ? cause.message : "The Codex login could not start a Realtime session.", "Run codex once to refresh the login, then wake Nia again."));
      return false;
    }
    if (!session?.ok || !session.sessionId) {
      const detail = session.error;
      this.emit(errorReport(generation, detail?.code ?? "CODEX_SESSION_UNAVAILABLE", detail?.message ?? "The Codex login could not start a Realtime session.", detail?.recovery));
      return false;
    }
    this.sessionId = session.sessionId;
    try {
      this.microphone = microphone ? await navigator.mediaDevices.getUserMedia({ audio: true }) : null;
      const peer = new RTCPeerConnection();
      this.peer = peer;
      if (this.microphone) {
        for (const track of this.microphone.getAudioTracks()) peer.addTrack(track, this.microphone);
      } else {
        peer.addTransceiver("audio", { direction: "recvonly" });
      }
      peer.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) handlers.playAudio(stream);
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
          this.emit(errorReport(generation, "REALTIME_CONNECTION_LOST", "The Realtime connection ended.", "Wake Nia again to reconnect."));
        }
      };
      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.onmessage = (event) => this.handleServerEvent(event.data);
      channel.onopen = () => {
        this.emit({ type: "state", generation, state: "listening" });
        this.sendSessionUpdate();
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const localOffer = peer.localDescription?.sdp;
      if (!localOffer) throw new Error("No local WebRTC offer was produced.");
      const answer = await bridge.sdp(session.sessionId, localOffer);
      if (!answer.ok || !answer.answer) {
        throw new Error(answer.error?.message ?? "The Realtime SDP exchange failed.");
      }
      await peer.setRemoteDescription({ type: "answer", sdp: answer.answer });
      this.emit({ type: "opened", generation, sessionId: session.sessionId, expiresAt: session.expiresAt ?? null });
      return true;
    } catch (cause) {
      this.close(generation, false);
      this.emit(errorReport(generation, "REALTIME_CONNECT_FAILED", cause instanceof Error ? cause.message : "The Realtime connection could not start.", "Check microphone permission and wake Nia again."));
      return false;
    }
  }

  sendText(text: string) {
    const value = text.trim().slice(0, 20_000);
    if (!value || this.channel?.readyState !== "open") return false;
    this.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: value }] } });
    this.send({ type: "response.create", response: { modalities: ["text", "audio"] } });
    return true;
  }

  sendReminder(reminder: { count: number; items: unknown[] }) {
    const prompt = `复习提醒：你有 ${reminder.count} 个内容待复习。请先用一句话概括重点，然后询问是否现在开始。`;
    return this.sendText(prompt);
  }

  sendConfig(config: Record<string, unknown> | null) {
    if (!config || this.channel?.readyState !== "open") return false;
    this.send({ type: "session.update", session: config });
    return true;
  }

  setMuted(muted: boolean) {
    for (const track of this.microphone?.getAudioTracks() ?? []) track.enabled = !muted;
    return true;
  }

  close(generation = this.generation, report = true) {
    const oldGeneration = this.generation;
    this.channel?.close();
    this.channel = null;
    this.peer?.close();
    this.peer = null;
    for (const track of this.microphone?.getTracks() ?? []) track.stop();
    this.microphone = null;
    this.sessionId = null;
    if (report && oldGeneration) this.emit({ type: "closed", generation, });
  }

  private send(payload: Record<string, unknown>) {
    if (this.channel?.readyState !== "open") return false;
    this.channel.send(JSON.stringify(payload));
    return true;
  }

  private sendSessionUpdate() {
    this.send({ type: "session.update", session: { modalities: ["text", "audio"], input_audio_transcription: { model: "gpt-4o-mini-transcribe" }, turn_detection: { type: "server_vad" } } });
  }

  private handleServerEvent(raw: unknown) {
    let event: Record<string, unknown>;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      event = parsed as Record<string, unknown>;
    } catch { return; }
    const generation = this.generation;
    const type = typeof event.type === "string" ? event.type : "";
    const error = event.error && typeof event.error === "object" && !Array.isArray(event.error)
      ? event.error as Record<string, unknown>
      : null;
    if (type === "conversation.item.input_audio_transcription.completed") {
      this.emit({ type: "heard", generation, text: typeof event.transcript === "string" ? event.transcript : "", itemId: typeof event.item_id === "string" ? event.item_id : undefined });
      return;
    }
    if (type === "response.audio_transcript.done" || type === "response.output_text.done") {
      this.emit({ type: "said", generation, text: typeof event.transcript === "string" ? event.transcript : (typeof event.text === "string" ? event.text : ""), responseId: typeof event.response_id === "string" ? event.response_id : undefined, itemId: typeof event.item_id === "string" ? event.item_id : undefined });
      return;
    }
    if (type === "response.created") this.emit({ type: "state", generation, state: "thinking" });
    else if (type === "response.audio.delta") this.emit({ type: "state", generation, state: "speaking" });
    else if (type === "response.done") this.emit({ type: "state", generation, state: "listening" });
    else if (type === "error") this.emit(errorReport(generation, typeof error?.code === "string" ? error.code : "REALTIME_EVENT_ERROR", typeof error?.message === "string" ? error.message : "Realtime returned an error.", "Rest Nia, then wake her again."));
  }

  private emit(report: CompanionTransportReport) {
    this.handlers?.report(report);
    bridgeForWindow()?.report(report);
  }
}
