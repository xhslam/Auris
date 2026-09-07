"use client";

import { createNiaRealtimePendingTurns, type NiaSettledRealtimeTurn } from "@/features/nia/nia-realtime-pending";
import {
  createNiaRealtimeSessionUpdate,
  isNiaTurnEagerness,
  parseNiaRealtimeServerEvent,
} from "@/features/nia/nia-realtime-protocol";
import { isNiaLiveVoice } from "@/features/nia/nia-live-session-config";
import type { NiaVoiceAnswer, NiaVoiceOpened } from "@/features/nia/nia-companion-answers";

export type CompanionTransportReport =
  | { type: "opened"; generation: number; sessionId: string; expiresAt: number | null }
  | { type: "state"; generation: number; state: string }
  | { type: "heard" | "said"; generation: number; text: string; at?: number; responseId?: string; itemId?: string; cut?: boolean }
  | { type: "tool"; generation: number; name: string; callId: string; at?: number; status?: string }
  | { type: "failed"; generation: number; code: string; message: string; recovery?: string }
  | { type: "closed"; generation: number; at?: number };

export type CompanionBridge = {
  ready: (payload?: Record<string, unknown>) => boolean;
  subscribe: (listener: (command: unknown) => void) => boolean;
  unsubscribe: (listener: (command: unknown) => void) => boolean;
  openSession: () => Promise<NiaVoiceOpened>;
  sdp: (sessionId: string, offer: string) => Promise<NiaVoiceAnswer>;
  report: (report: CompanionTransportReport) => boolean;
  pointerCapture: (enabled: boolean) => Promise<unknown>;
  dragBegin: (x: number, y: number) => Promise<unknown>;
  dragTo: (x: number, y: number) => Promise<unknown>;
  dragEnd: (options?: { retainCapture?: boolean }) => Promise<unknown>;
  openNia: () => Promise<unknown>;
  wake: () => Promise<unknown>;
  showMenu: () => Promise<unknown>;
};

type TransportHandlers = {
  report: (report: CompanionTransportReport) => void;
  playAudio: (stream: MediaStream) => void;
};

// A live conversation must never be negotiated as receive-only.  In
// particular, a reminder can wake Nia before its owner clicks the companion;
// if that session lacks a local track, later wakes only reuse the deaf session.
// These are the same voice-oriented capture constraints used by Mochi.
export const NIA_REALTIME_MICROPHONE_CONSTRAINTS: MediaTrackConstraints = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
});

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

function closeRealtimeResources(peer: RTCPeerConnection | null, channel: RTCDataChannel | null, microphone: MediaStream | null) {
  if (channel) channel.onmessage = null;
  channel?.close();
  if (peer) peer.onconnectionstatechange = null;
  peer?.close();
  for (const track of microphone?.getTracks() ?? []) track.stop();
}

export class NiaRealtimeTransport {
  private peer: RTCPeerConnection | null = null;
  private microphone: MediaStream | null = null;
  private channel: RTCDataChannel | null = null;
  private generation = 0;
  private sessionId: string | null = null;
  private expiresAt: number | null = null;
  private handlers: TransportHandlers | null = null;
  private pending = createNiaRealtimePendingTurns();
  private configurationTimer: number | null = null;
  private configured = false;
  private operation = 0;

  async open(generation: number, handlers: TransportHandlers): Promise<boolean> {
    this.flushPending(generation);
    this.shutdownMedia();
    this.generation = generation;
    this.handlers = handlers;
    this.pending = createNiaRealtimePendingTurns();
    this.configured = false;
    const operation = ++this.operation;
    const bridge = bridgeForWindow();
    if (!bridge || typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.emit(errorReport(generation, "REALTIME_UNSUPPORTED", "This companion cannot start local Realtime audio.", "Use a recent Auris desktop build, then wake Nia again."));
      return false;
    }
    let session: NiaVoiceOpened | null = null;
    try {
      session = await bridge.openSession();
    } catch (cause) {
      if (operation !== this.operation) return false;
      this.emit(errorReport(generation, "CODEX_SESSION_UNAVAILABLE", cause instanceof Error ? cause.message : "The Codex login could not start a Realtime session.", "Run codex once to refresh the login, then wake Nia again."));
      return false;
    }
    if (operation !== this.operation) return false;
    if (!session || !session.ok) {
      const detail = session?.error;
      this.emit(errorReport(generation, detail?.code ?? "CODEX_SESSION_UNAVAILABLE", detail?.message ?? "The Codex login could not start a Realtime session.", detail?.recovery));
      return false;
    }
    this.sessionId = session.sessionId;
    this.expiresAt = session.expiresAt ?? null;
    let localMicrophone: MediaStream | null = null;
    let localPeer: RTCPeerConnection | null = null;
    let localChannel: RTCDataChannel | null = null;
    try {
      localMicrophone = await navigator.mediaDevices.getUserMedia({
        audio: NIA_REALTIME_MICROPHONE_CONSTRAINTS,
      });
      if (operation !== this.operation) {
        closeRealtimeResources(null, null, localMicrophone);
        return false;
      }
      localPeer = new RTCPeerConnection();
      for (const track of localMicrophone.getAudioTracks()) localPeer.addTrack(track, localMicrophone);
      localPeer.ontrack = (event) => {
        if (operation !== this.operation) return;
        const [stream] = event.streams;
        if (stream) handlers.playAudio(stream);
      };
      localPeer.onconnectionstatechange = () => {
        if (operation !== this.operation) return;
        if (["failed", "disconnected", "closed"].includes(localPeer?.connectionState ?? "closed")) {
          this.emit(errorReport(generation, "REALTIME_CONNECTION_LOST", "The Realtime connection ended.", "Wake Nia again to reconnect."));
        }
      };
      localChannel = localPeer.createDataChannel("oai-events");
      const offer = await localPeer.createOffer();
      await localPeer.setLocalDescription(offer);
      await waitForIceGathering(localPeer);
      const localOffer = localPeer.localDescription?.sdp;
      if (!localOffer) throw new Error("No local WebRTC offer was produced.");
      const answer = await bridge.sdp(session.sessionId, localOffer);
      if (operation !== this.operation) {
        closeRealtimeResources(localPeer, localChannel, localMicrophone);
        return false;
      }
      if (!answer.ok) {
        throw new Error(answer.error?.message ?? "The Realtime SDP exchange failed.");
      }
      await localPeer.setRemoteDescription({ type: "answer", sdp: answer.answer });
      if (operation !== this.operation) {
        closeRealtimeResources(localPeer, localChannel, localMicrophone);
        return false;
      }
      this.microphone = localMicrophone;
      this.peer = localPeer;
      this.channel = localChannel;
      localChannel.onmessage = (event) => this.handleServerEvent(event.data);
      const configure = () => {
        if (operation !== this.operation || this.channel !== localChannel) return;
        this.sendSessionUpdate();
        this.armConfigurationConfirmation(generation);
      };
      localChannel.onopen = configure;
      if (localChannel.readyState === "open") configure();
      return true;
    } catch (cause) {
      if (operation !== this.operation) {
        closeRealtimeResources(localPeer, localChannel, localMicrophone);
        return false;
      }
      const committed = Boolean(
        (localPeer && this.peer === localPeer)
        || (localChannel && this.channel === localChannel)
        || (localMicrophone && this.microphone === localMicrophone),
      );
      this.close(generation, false);
      if (!committed) closeRealtimeResources(localPeer, localChannel, localMicrophone);
      this.emit(errorReport(generation, "REALTIME_CONNECT_FAILED", cause instanceof Error ? cause.message : "The Realtime connection could not start.", "Check microphone permission and wake Nia again."));
      return false;
    }
  }

  sendText(text: string) {
    const value = text.trim().slice(0, 20_000);
    if (!value || this.channel?.readyState !== "open") return false;
    this.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: value }] } });
    this.send({ type: "response.create" });
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
    this.operation += 1;
    this.flushPending(generation);
    this.shutdownMedia();
    if (report) this.emit({ type: "closed", generation, at: Date.now() });
  }

  private send(payload: Record<string, unknown>) {
    if (this.channel?.readyState !== "open") return false;
    this.channel.send(JSON.stringify(payload));
    return true;
  }

  private sendSessionUpdate() {
    let savedVoice: string | null = null;
    let savedInterruptible: string | null = null;
    let savedEagerness: string | null = null;
    try {
      savedVoice = window.localStorage.getItem("auris.nia.voice");
      savedInterruptible = window.localStorage.getItem("auris.nia.interruptible");
      savedEagerness = window.localStorage.getItem("auris.nia.eagerness");
    } catch { /* storage preference is optional */ }

    const interruptible = savedInterruptible === null ? true : savedInterruptible !== "false";
    const eagerness = isNiaTurnEagerness(savedEagerness) ? savedEagerness : "auto";

    this.send(createNiaRealtimeSessionUpdate({
      voice: isNiaLiveVoice(savedVoice) ? savedVoice : "ballad",
      turnTaking: {
        interruptible,
        eagerness,
      },
    }));
  }

  private handleServerEvent(raw: unknown) {
    const generation = this.generation;
    const event = parseNiaRealtimeServerEvent(raw);
    switch (event.kind) {
      case "session-created":
        if (event.expiresAt !== null) this.expiresAt = event.expiresAt;
        return;
      case "session-updated":
        this.clearConfigurationTimer();
        if (!this.configured && this.sessionId) {
          this.configured = true;
          this.emit({ type: "opened", generation, sessionId: this.sessionId, expiresAt: this.expiresAt });
          this.emit({ type: "state", generation, state: "listening" });
        }
        return;
      case "heard":
        this.emit({ type: "heard", generation, text: event.transcript, at: Date.now(), itemId: event.itemId });
        return;
      case "item-added":
        this.pending.began(event.itemId, event.responseId);
        return;
      case "saying":
        this.emit({ type: "state", generation, state: "speaking" });
        return;
      case "said":
        this.emitSettled(this.pending.said(event.itemId, event.transcript, Date.now(), event.responseId), generation);
        return;
      case "truncated":
        this.emitSettled(this.pending.truncated(event.itemId, Date.now()), generation);
        return;
      case "audio-buffer":
        if (event.phase === "started") this.emit({ type: "state", generation, state: "speaking" });
        if (event.phase === "stopped") {
          for (const turn of this.pending.finished(event.responseId)) this.emitSettled(turn, generation);
          this.emit({ type: "state", generation, state: "listening" });
        }
        if (event.phase === "cleared") this.emit({ type: "state", generation, state: "listening" });
        return;
      case "tool":
        this.emit({ type: "tool", generation, name: event.name, callId: event.callId, at: Date.now() });
        return;
      case "response-created":
        this.emit({ type: "state", generation, state: "thinking" });
        return;
      case "response-done":
        return;
      case "error":
        this.emit(errorReport(generation, event.code, event.message, "Rest Nia, then wake her again."));
        return;
      case "malformed":
        this.emit(errorReport(generation, "REALTIME_PROTOCOL_MALFORMED", `${event.type} is missing ${event.missing.join(", ")}.`, "Rest Nia, then wake her again."));
        return;
      case "other":
      case "unreadable":
        return;
    }
  }

  private emitSettled(turn: NiaSettledRealtimeTurn | null, generation: number) {
    if (!turn) return;
    this.emit({
      type: "said",
      generation,
      text: turn.text,
      at: turn.at || Date.now(),
      cut: turn.cut,
      itemId: turn.itemId,
      responseId: turn.responseId ?? undefined,
    });
  }

  private flushPending(generation: number) {
    for (const turn of this.pending.flush()) this.emitSettled(turn, generation);
  }

  private armConfigurationConfirmation(generation: number) {
    this.clearConfigurationTimer();
    this.configurationTimer = window.setTimeout(() => {
      this.configurationTimer = null;
      if (this.generation !== generation || this.configured) return;
      this.emit(errorReport(generation, "REALTIME_SESSION_NOT_CONFIGURED", "Realtime did not confirm Nia's audio and transcription configuration.", "Rest Nia, then wake her again."));
    }, 5_000);
  }

  private clearConfigurationTimer() {
    if (this.configurationTimer !== null) window.clearTimeout(this.configurationTimer);
    this.configurationTimer = null;
  }

  private shutdownMedia() {
    this.clearConfigurationTimer();
    const channel = this.channel;
    const peer = this.peer;
    const microphone = this.microphone;
    this.channel = null;
    this.peer = null;
    this.microphone = null;
    closeRealtimeResources(peer, channel, microphone);
    this.sessionId = null;
    this.expiresAt = null;
    this.configured = false;
  }

  private emit(report: CompanionTransportReport) {
    this.handlers?.report(report);
    bridgeForWindow()?.report(report);
  }
}
