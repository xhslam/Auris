"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NIA_AVATAR_CUE_EVENT, NIA_AVATAR_CUE_KEY, niaAudioEnvelope, niaExpressionForStatus, parseNiaAvatarCue, type NiaAvatarCue, type NiaMotion } from "@/features/nia/nia-avatar-behavior";

const CLIPS: Record<NiaMotion | "poke", { duration: number; frames: Keyframe[]; loop?: boolean }> = {
  nod: { duration: 620, frames: [{ transform: "none" }, { transform: "translateY(3px) scale(1.035,.965) rotate(2deg)" }, { transform: "translateY(-1px) rotate(-1deg)" }, { transform: "none" }] },
  hop: { duration: 460, frames: [{ transform: "none" }, { transform: "scale(1.05,.95)" }, { transform: "translateY(-9px) scale(.98,1.02)" }, { transform: "scale(1.04,.96)" }, { transform: "none" }] },
  turn: { duration: 950, frames: [{ transform: "none" }, { transform: "translateX(5px) rotate(3deg)" }, { transform: "translateX(5px) rotate(3deg)" }, { transform: "none" }] },
  sway: { duration: 3800, loop: true, frames: [{ transform: "rotate(0)" }, { transform: "rotate(2deg)" }, { transform: "rotate(0)" }, { transform: "rotate(-2deg)" }, { transform: "rotate(0)" }] },
  swing: { duration: 3400, loop: true, frames: [{ transform: "none" }, { transform: "translateX(4px) rotate(2deg)" }, { transform: "none" }, { transform: "translateX(-4px) rotate(-2deg)" }, { transform: "none" }] },
  wander: { duration: 6200, loop: true, frames: [{ transform: "none" }, { transform: "translate(7px,-2px) rotate(1deg)" }, { transform: "translate(7px,-2px) rotate(1deg)" }, { transform: "none" }] },
  poke: { duration: 480, frames: [{ transform: "scale(1,1)" }, { transform: "scale(1.07,.935)" }, { transform: "scale(.98,1.02)" }, { transform: "scale(1,1)" }] },
};

export function useCompanionAvatar(status: string, driftEnabled: boolean) {
  const figureRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const [cue, setCue] = useState<NiaAvatarCue | null>(null);
  const [reduced, setReduced] = useState(false);
  const animationRef = useRef<Animation | null>(null);
  const faceAnimationRef = useRef<Animation | null>(null);
  const audioCleanup = useRef<(() => void) | null>(null);
  const gazeRef = useRef({ x: 0, y: 0 });
  const expression = cue?.expression ?? niaExpressionForStatus(status);
  const asleep = status === "resting" && !cue;

  const stopAudio = useCallback(() => {
    audioCleanup.current?.();
    audioCleanup.current = null;
    figureRef.current?.style.setProperty("--nia-mouth-open", "0");
  }, []);

  const connectAudio = useCallback((stream: MediaStream, audio: HTMLAudioElement) => {
    stopAudio();
    if (typeof AudioContext === "undefined") return;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let frame = 0;
      let last = performance.now();
      let envelope = 0;
      const tick = (now: number) => {
        analyser.getFloatTimeDomainData(samples);
        const target = audio.paused || audio.muted || audio.ended ? 0 : niaAudioEnvelope(samples);
        const dt = Math.max(0, Math.min(100, now - last));
        envelope += (target - envelope) * (1 - Math.exp(-dt / (target > envelope ? 35 : 110)));
        last = now;
        figureRef.current?.style.setProperty("--nia-mouth-open", envelope.toFixed(3));
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      const activeContext = context;
      const cleanup = () => { cancelAnimationFrame(frame); source.disconnect(); analyser.disconnect(); void activeContext.close().catch(() => undefined); };
      audioCleanup.current = cleanup;
      void context.resume().catch(() => {
        if (audioCleanup.current === cleanup) stopAudio();
      });
    } catch {
      if (context) void context.close().catch(() => undefined);
      stopAudio();
    }
  }, [stopAudio]);

  const playMotion = useCallback((name: NiaMotion | "poke") => {
    animationRef.current?.cancel();
    faceAnimationRef.current?.cancel();
    const clip = CLIPS[name];
    if (reduced || (clip.loop && !driftEnabled)) return;
    if (name === "turn") {
      faceAnimationRef.current = figureRef.current?.querySelector(".nia-companion__face")?.animate?.([
        { transform: "translateX(0)" }, { transform: "translateX(12px)" },
        { transform: "translateX(10px)" }, { transform: "translateX(0)" },
      ], { duration: clip.duration, easing: "ease-in-out" }) ?? null;
    }
    animationRef.current = rigRef.current?.animate?.(clip.frames, {
      duration: clip.duration, iterations: clip.loop ? Infinity : 1, easing: "ease-in-out",
    }) ?? null;
  }, [reduced, driftEnabled]);

  const lookAt = useCallback((x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    gazeRef.current = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    figureRef.current?.style.setProperty("--nia-gaze-x", `${gazeRef.current.x * 4}px`);
    figureRef.current?.style.setProperty("--nia-gaze-y", `${gazeRef.current.y * 3}px`);
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const accept = (value: unknown) => {
      const next = parseNiaAvatarCue(value);
      if (next) setCue(next);
    };
    const read = (value: string | null) => { try { accept(JSON.parse(value ?? "null")); } catch { /* Ignore malformed cross-window messages. */ } };
    try { read(window.localStorage.getItem(NIA_AVATAR_CUE_KEY)); } catch { /* Optional preview persistence. */ }
    const onStorage = (event: StorageEvent) => { if (event.key === NIA_AVATAR_CUE_KEY) read(event.newValue); };
    const onCue = (event: Event) => accept((event as CustomEvent<unknown>).detail);
    window.addEventListener("storage", onStorage); window.addEventListener(NIA_AVATAR_CUE_EVENT, onCue);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(NIA_AVATAR_CUE_EVENT, onCue); };
  }, []);

  useEffect(() => {
    if (!cue) return;
    const timer = window.setTimeout(() => setCue(null), Math.max(0, cue.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [cue]);

  useEffect(() => {
    animationRef.current?.cancel();
    faceAnimationRef.current?.cancel();
    if (cue?.motion) playMotion(cue.motion);
    return () => { animationRef.current?.cancel(); faceAnimationRef.current?.cancel(); };
  }, [cue, playMotion]);

  useEffect(() => {
    if (status === "resting" || status === "failed") stopAudio();
  }, [status, stopAudio]);
  useEffect(() => () => { stopAudio(); animationRef.current?.cancel(); faceAnimationRef.current?.cancel(); }, [stopAudio]);

  return { figureRef, rigRef, expression, intensity: cue?.intensity ?? 1, asleep, playMotion, lookAt, connectAudio, stopAudio };
}
