"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { appendNiaAuditEvent } from "@/features/nia/nia-audit-log";
import { getNiaCompanionHostBridge } from "@/features/nia/nia-companion-bridge";
import { recordNiaLiveUsage } from "@/features/nia/nia-usage-store";

export type NiaLiveStatus = "idle" | "requesting_microphone" | "connecting" | "connected" | "closing" | "failed";

function localStorageOrNull() {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

function stateToStatus(state: unknown): NiaLiveStatus {
  if (state === "opening") return "connecting";
  if (["listening", "attending", "thinking", "speaking", "working"].includes(String(state))) return "connected";
  if (state === "failed") return "failed";
  return "idle";
}

export function useNiaLiveSession() {
  const [status, setStatus] = useState<NiaLiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const connectedRecorded = useRef(false);

  useEffect(() => {
    const bridge = getNiaCompanionHostBridge(window);
    if (!bridge) {
      setError("Nia Live is available in the Auris desktop companion.");
      return;
    }
    const onEvent = (raw: unknown) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const event = raw as { type?: unknown; snapshot?: { state?: unknown; muted?: unknown }; report?: { type?: unknown; text?: unknown; message?: unknown } };
      if (event.type === "snapshot") {
        const nextStatus = stateToStatus(event.snapshot?.state);
        setStatus(nextStatus);
        if (typeof event.snapshot?.muted === "boolean") setMuted(event.snapshot.muted);
        if (nextStatus === "connected" && !connectedRecorded.current) {
          connectedRecorded.current = true;
          recordNiaLiveUsage(localStorageOrNull());
          appendNiaAuditEvent(localStorageOrNull(), { category: "voice", action: "connected", detail: "Started a Codex-login Realtime session." });
        }
        return;
      }
      if (event.type !== "report") return;
      const report = event.report;
      if (report?.type === "heard" || report?.type === "said") {
        if (typeof report.text === "string" && report.text.trim()) setTranscript((current) => `${current ? `${current}\n` : ""}${report.text}`.slice(-6000));
      } else if (report?.type === "failed") {
        setStatus("failed");
        setError(typeof report.message === "string" ? report.message : "Realtime is temporarily unavailable.");
      }
    };
    bridge.subscribe(onEvent);
    void bridge.invoke("snapshot").then((snapshot) => onEvent({ type: "snapshot", snapshot })).catch(() => undefined);
    return () => { bridge.unsubscribe(onEvent); };
  }, []);

  const stop = useCallback(() => {
    const bridge = getNiaCompanionHostBridge(window);
    if (!bridge) return;
    setStatus("closing");
    void bridge.invoke("rest").catch(() => undefined).finally(() => {
      setMuted(false);
      setTranscript("");
      setStatus("idle");
      connectedRecorded.current = false;
      appendNiaAuditEvent(localStorageOrNull(), { category: "voice", action: "stopped", detail: "Stopped the Codex-login Realtime session." });
    });
  }, []);

  const start = useCallback(async () => {
    const bridge = getNiaCompanionHostBridge(window);
    if (!bridge) {
      setError("Nia Live is available in the Auris desktop companion.");
      setStatus("failed");
      return false;
    }
    if (["requesting_microphone", "connecting", "connected"].includes(status)) return false;
    setError(null);
    setTranscript("");
    setStatus("connecting");
    const result = await bridge.invoke("wake").catch(() => false);
    if (result === false) {
      setStatus("failed");
      setError("Codex login could not start Realtime.");
      appendNiaAuditEvent(localStorageOrNull(), { category: "voice", action: "failed", detail: "The Codex-login Realtime session did not start." });
      return false;
    }
    return true;
  }, [status]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    const bridge = getNiaCompanionHostBridge(window);
    setMuted(next);
    void bridge?.invoke("mute", { muted: next }).catch(() => setMuted(!next));
  }, [isMuted]);

  return { error, isMuted, start, status, stop, toggleMute, transcript };
}
