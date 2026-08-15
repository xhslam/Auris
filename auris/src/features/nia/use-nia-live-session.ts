"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { appendNiaAuditEvent } from "@/features/nia/nia-audit-log";
import { NIA_LIVE_MODEL, type NiaLiveVoice } from "@/features/nia/nia-live-session-config";
import { recordNiaLiveUsage } from "@/features/nia/nia-usage-store";

export type NiaLiveStatus = "idle" | "requesting_microphone" | "connecting" | "connected" | "closing" | "failed";
type RealtimeEvent = { type?: string; delta?: string; transcript?: string; error?: { message?: string } };
const INSTANCE_KEY = "auris.nia.live.client-instance.v1";
function localStorageOrNull() { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
function instanceId() {
  const storage = localStorageOrNull(); const existing = storage?.getItem(INSTANCE_KEY);
  if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing;
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
  const created = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  try { storage?.setItem(INSTANCE_KEY, created); } catch { /* A one-session ID is still privacy preserving. */ }
  return created;
}
function cleanError(error: unknown) { return error instanceof Error ? error.message : "Unable to start GPT Live."; }

export function useNiaLiveSession() {
  const [status, setStatus] = useState<NiaLiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const stoppingRef = useRef(false);

  const stop = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true; setStatus("closing");
    try { channelRef.current?.close(); } catch { /* Best effort. */ } channelRef.current = null;
    try { connectionRef.current?.close(); } catch { /* Best effort. */ } connectionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.srcObject = null; } audioRef.current = null;
    setMuted(false); setTranscript(""); setStatus("idle"); stoppingRef.current = false;
    appendNiaAuditEvent(localStorageOrNull(), { category: "voice", action: "stopped", detail: "Stopped the local GPT Live microphone session." });
  }, []);

  const start = useCallback(async (voice: NiaLiveVoice = "marin") => {
    if (status === "requesting_microphone" || status === "connecting" || status === "connected") return false;
    if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) { setError("WebRTC or microphone access is unavailable in this window."); setStatus("failed"); return false; }
    setError(null); setTranscript(""); setStatus("requesting_microphone");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream; setStatus("connecting");
      const session = await fetch("/api/nia/realtime-session", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ clientInstanceId: instanceId(), voice }) });
      const detail = await session.json().catch(() => null) as { clientSecret?: string; error?: { message?: string } } | null;
      if (!session.ok || !detail?.clientSecret) throw new Error(detail?.error?.message ?? "Unable to obtain a short-lived GPT Live credential.");
      const connection = new RTCPeerConnection(); connectionRef.current = connection;
      const audio = document.createElement("audio"); audio.autoplay = true; audioRef.current = audio;
      connection.ontrack = (event) => { audio.srcObject = event.streams[0] ?? null; void audio.play().catch(() => undefined); };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") { setStatus("connected"); appendNiaAuditEvent(localStorageOrNull(), { category: "voice", action: "connected", detail: "Started a local " + NIA_LIVE_MODEL + " WebRTC session." }); recordNiaLiveUsage(localStorageOrNull()); }
        if (["failed", "disconnected"].includes(connection.connectionState) && !stoppingRef.current) { setStatus("failed"); setError("The GPT Live connection ended."); }
      };
      const channel = connection.createDataChannel("oai-events"); channelRef.current = channel;
      channel.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as RealtimeEvent;
          if (parsed.type === "response.output_audio_transcript.delta" && parsed.delta) setTranscript((current) => (current + parsed.delta).slice(-6000));
          if (parsed.type === "response.output_audio_transcript.done" && parsed.transcript) setTranscript((current) => (current ? current + "\n" : "") + parsed.transcript);
          if (parsed.type === "error") setError(parsed.error?.message ?? "GPT Live returned an error.");
        } catch { /* Ignore malformed data-channel events. */ }
      };
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const offer = await connection.createOffer(); await connection.setLocalDescription(offer);
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: "Bearer " + detail.clientSecret, "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!answer.ok) throw new Error("GPT Live rejected the WebRTC session offer.");
      await connection.setRemoteDescription({ type: "answer", sdp: await answer.text() }); return true;
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
      try { connectionRef.current?.close(); } catch { /* Best effort. */ } connectionRef.current = null;
      setError(cleanError(cause)); setStatus("failed"); appendNiaAuditEvent(localStorageOrNull(), { category: "voice", action: "failed", detail: "GPT Live did not start; no microphone stream remains active." }); return false;
    }
  }, [status]);
  const toggleMute = useCallback(() => { const next = !isMuted; streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); }, [isMuted]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); connectionRef.current?.close(); }, []);
  return { error, isMuted, start, status, stop, toggleMute, transcript };
}
