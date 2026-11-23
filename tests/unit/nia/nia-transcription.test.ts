import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNiaRealtimeSessionUpdate, parseNiaRealtimeServerEvent } from "@/features/nia/nia-realtime-protocol";
import { NiaRealtimeTransport, type CompanionTransportReport } from "@/components/nia/companion/realtime-transport";

const require = createRequire(import.meta.url);
const { createRealtimeCoordinator } = require("../../../electron/nia/companion/realtime-coordinator.cjs");
const { createConversationLifecycle } = require("../../../electron/nia/companion/conversation-lifecycle.cjs");
const { createNiaCompanionHostDispatcher } = require("../../../electron/nia/companion/companion-answers.cjs");

function transportFixture() {
  const reports: CompanionTransportReport[] = [];
  const track = { enabled: false, stop: vi.fn() };
  const channel = { readyState: "open", send: vi.fn(), close: vi.fn(), onmessage: null };
  const transport = new NiaRealtimeTransport();
  const internals = transport as unknown as {
    mode: string; generation: number; sessionId: string; channel: typeof channel;
    microphone: { getAudioTracks: () => typeof track[]; getTracks: () => typeof track[] };
    handlers: { report: (report: CompanionTransportReport) => void; playAudio: () => void };
    handleServerEvent: (event: unknown) => void;
  };
  Object.assign(internals, {
    mode: "transcription", generation: 1, sessionId: "test-session", channel,
    microphone: { getAudioTracks: () => [track], getTracks: () => [track] },
    handlers: { report: (report: CompanionTransportReport) => reports.push(report), playAudio: vi.fn() },
  });
  return { transport, internals, reports, track, channel };
}

function coordinatorFixture() {
  const sent: Record<string, unknown>[] = [];
  const store = { begin: vi.fn(() => "text-record"), say: vi.fn(() => true), end: vi.fn(), tool: vi.fn() };
  const conversation = createConversationLifecycle({ store, personaId: "nia", now: () => 100 });
  const savePreference = vi.fn();
  const coordinator = createRealtimeCoordinator({
    conversation, credentialBroker: { read: async () => ({ ok: true, credential: {} }) },
    transport: { send: (command: Record<string, unknown>) => sent.push(command) },
    initialConversationSaving: false, saveConversationSaving: savePreference,
  });
  return { coordinator, store, sent, savePreference };
}

afterEach(() => { vi.useRealTimers(); });

describe("Nia transcription-only mode", () => {
  it("disables service-generated responses rather than just muting playback", () => {
    const session = createNiaRealtimeSessionUpdate({ mode: "transcription" }).session;
    expect(session.audio.input.turn_detection).toMatchObject({ type: "server_vad", create_response: false, interrupt_response: false });
    expect(session.audio.input.transcription.model).toBe("gpt-transcribe");
    expect(parseNiaRealtimeServerEvent({ type: "conversation.item.input_audio_transcription.delta", item_id: "i", delta: "你好" }))
      .toEqual({ kind: "hearing", itemId: "i", delta: "你好" });
  });

  it("requires a confirmed no-response config before enabling microphone transmission", () => {
    const s = transportFixture();
    s.internals.handleServerEvent({ type: "session.updated", session: { audio: { input: { turn_detection: { create_response: false } } } } });
    expect(s.track.enabled).toBe(true);
    expect(s.reports).toContainEqual(expect.objectContaining({ type: "opened" }));
    s.transport.close(1, false);
  });

  it("fails closed and releases microphone if the provider does not confirm no-response", () => {
    const s = transportFixture();
    s.internals.handleServerEvent({ type: "session.updated" });
    expect(s.track.enabled).toBe(false);
    expect(s.track.stop).toHaveBeenCalled();
    expect(s.channel.close).toHaveBeenCalled();
    expect(s.reports).toContainEqual(expect.objectContaining({ type: "failed", code: "TRANSCRIPTION_CONFIG_REFUSED" }));
    expect(s.reports.some((report) => report.type === "opened")).toBe(false);
  });

  it("blocks typed messages, reminders and all assistant output, and cancels unexpected responses", () => {
    const s = transportFixture();
    expect(s.transport.sendText("hello")).toBe(false);
    expect(s.transport.sendReminder({ count: 3, items: [] })).toBe(false);
    s.internals.handleServerEvent({ type: "response.created" });
    s.internals.handleServerEvent({ type: "response.output_audio_transcript.delta", response_id: "r", delta: "你好" });
    s.internals.handleServerEvent({ type: "response.output_text.done", response_id: "r", item_id: "a", text: "回答" });
    expect(s.channel.send).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ type: "response.cancel" }));
    expect(s.reports).toEqual([]);
    s.transport.close(1, false);
  });

  it("keeps no-response settings when preference updates try to re-enable conversation", () => {
    const s = transportFixture();
    s.transport.sendConfig({ audio: { input: { turn_detection: { create_response: true } } } });
    expect(JSON.parse(s.channel.send.mock.calls[0][0]).session).toMatchObject({ tools: [], audio: { input: { turn_detection: { create_response: false } } } });
    s.transport.close(1, false);
  });

  it("streams drafts, files completed input once, and keeps the tail channel briefly after capture stops", () => {
    vi.useFakeTimers();
    const s = transportFixture();
    s.internals.handleServerEvent({ type: "conversation.item.input_audio_transcription.delta", item_id: "i", delta: "你好" });
    expect(s.reports).toContainEqual(expect.objectContaining({ type: "hearing", text: "你好" }));
    s.internals.handleServerEvent({ type: "input_audio_buffer.speech_started" });
    s.transport.close();
    expect(s.track.stop).toHaveBeenCalled();
    expect(s.channel.close).not.toHaveBeenCalled();
    expect(s.channel.send).toHaveBeenCalledWith(JSON.stringify({ type: "input_audio_buffer.commit" }));
    s.internals.handleServerEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "i", transcript: "你好啊。" });
    s.internals.handleServerEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "i", transcript: "你好啊。" });
    vi.advanceTimersByTime(1800);
    expect(s.reports.filter((report) => report.type === "heard")).toEqual([expect.objectContaining({ text: "你好啊。" })]);
    expect(s.reports.at(-1)?.type).toBe("closed");
    expect(s.channel.close).toHaveBeenCalled();
  });

  it("saves an unconfirmed tail draft with a cut marker after a bounded drain", () => {
    vi.useFakeTimers();
    const s = transportFixture();
    s.internals.handleServerEvent({ type: "conversation.item.input_audio_transcription.delta", item_id: "i", delta: "未完的" });
    s.transport.close();
    s.transport.close();
    vi.advanceTimersByTime(1800);
    expect(s.reports.filter((report) => report.type === "heard")).toEqual([expect.objectContaining({ text: "未完的", cut: true })]);
  });

  it("saves only user text under a distinct source even when conversation saving is off", async () => {
    const s = coordinatorFixture();
    await s.coordinator.open({ mode: "transcription", reason: "nia-page" });
    const generation = s.coordinator.snapshot().generation;
    expect(s.sent.at(-1)).toMatchObject({ mode: "transcription" });
    s.coordinator.report({ type: "heard", generation, text: "会议文字", itemId: "i", cut: true });
    expect(s.coordinator.report({ type: "said", generation, text: "不该保存的回答" })).toBe(false);
    expect(s.coordinator.report({ type: "tool", generation, name: "x", callId: "c" })).toBe(false);
    expect(s.store.begin).toHaveBeenCalledWith(expect.objectContaining({ source: "transcription" }));
    expect(s.store.say).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ speaker: "user", text: "会议文字", cut: true }));
    expect(s.coordinator.sendText("hello")).toBe(false);
    expect(s.coordinator.queueReminder({ count: 1 })).toBe(false);
    expect(s.savePreference).not.toHaveBeenCalled();
    s.coordinator.dispose();
  });

  it("does not restart stopped transcription from reminders or companion clicks", async () => {
    const s = coordinatorFixture();
    await s.coordinator.open({ mode: "transcription", reason: "nia-page" });
    s.coordinator.rest();
    for (const reason of ["scheduled-reminder", "body-click", "context-menu"]) {
      expect(await s.coordinator.open({ reason })).toBe(false);
    }
    expect(s.coordinator.snapshot().state).toBe("resting");
    s.coordinator.dispose();
  });

  it("closes the old source before opening the new mode and restores the original saving preference", async () => {
    const s = coordinatorFixture();
    await s.coordinator.open({ mode: "transcription", reason: "nia-page" });
    const generation = s.coordinator.snapshot().generation;
    s.coordinator.report({ type: "heard", generation, text: "最后一句" });
    const opening = s.coordinator.open({ mode: "conversation", reason: "nia-page" });
    expect(s.sent.at(-1)).toMatchObject({ type: "close" });
    s.coordinator.report({ type: "closed", generation });
    await opening;
    expect(s.store.end).toHaveBeenCalledWith("text-record", expect.any(Number));
    s.coordinator.report({ type: "heard", generation: s.coordinator.snapshot().generation, text: "对话不保存" });
    expect(s.store.say).toHaveBeenCalledTimes(1);
    expect(s.coordinator.snapshot().mode).toBe("conversation");
    expect(s.coordinator.snapshot().savingConversations).toBe(false);
    s.coordinator.dispose();
  });

  it("uses the existing wake IPC payload without widening the preload command allowlist", async () => {
    const open = vi.fn();
    const dispatch = createNiaCompanionHostDispatcher({ getCoordinator: () => ({ open }) });
    await dispatch({ command: "wake", payload: { mode: "transcription" } });
    expect(open).toHaveBeenCalledWith({ reason: "nia-page", mode: "transcription" });
    await dispatch({ command: "wake" });
    expect(open).toHaveBeenLastCalledWith({ reason: "nia-page", mode: "conversation" });
  });
});
