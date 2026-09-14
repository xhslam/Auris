"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  DEFAULT_NIA_COMPANION_SCALE,
  loadNiaCompanionScale,
  subscribeToNiaCompanionScale,
} from "@/features/nia/nia-companion-scale";
import { NiaRealtimeTransport, type CompanionBridge, type CompanionTransportReport } from "./realtime-transport";
import { useNiaCompanionDrift } from "@/features/nia/nia-companion-motion";
import { useCompanionAvatar } from "./use-companion-avatar";
import "./companion.css";

type CompanionCommand =
  | { type: "open"; generation: number; reason?: string }
  | { type: "close"; generation: number; reason?: string }
  | { type: "text"; generation: number; text: string }
  | { type: "reminder"; generation: number; reminder: { count: number; items: unknown[] } }
  | { type: "config"; generation: number; config: Record<string, unknown> | null }
  | { type: "mute"; generation: number; muted: boolean };

declare global {
  interface Window { niaCompanion?: CompanionBridge }
}

function readableStatus(status: string) {
  switch (status) {
    case "opening": return "正在醒来";
    case "attending": return "我在听";
    case "thinking": return "让我想想";
    case "speaking": return "我在说";
    case "failed": return "暂时离线";
    default: return "陪你学习";
  }
}

export function CompanionRuntime() {
  const driftEnabled = useNiaCompanionDrift();
  const [status, setStatus] = useState("resting");
  const [lastText, setLastText] = useState("");
  const [isDragging, setDragging] = useState(false);
  const [companionScale, setCompanionScale] = useState(DEFAULT_NIA_COMPANION_SCALE);
  const { figureRef, rigRef, expression, intensity, asleep, playMotion, lookAt, connectAudio, stopAudio } = useCompanionAvatar(status, driftEnabled);
  const transportRef = useRef<NiaRealtimeTransport | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const capturesPointerRef = useRef(false);
  const isDraggingRef = useRef(false);
  const lastPointerPosRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const lastTargetRef = useRef<EventTarget | null>(null);
  const bridge = useMemo(() => (typeof window === "undefined" ? null : window.niaCompanion ?? null), []);

  const setCompanionPointerCapture = useCallback((enabled: boolean) => {
    if (!bridge || capturesPointerRef.current === enabled) return;
    capturesPointerRef.current = enabled;
    void bridge.pointerCapture(enabled);
  }, [bridge]);

  const isCompanionHitTarget = (target: EventTarget | null) => (
    target instanceof Element && target.closest("[data-nia-companion-hit-region]") !== null
  );

  const checkPointerHit = useCallback((
    pos?: { clientX: number; clientY: number } | null,
    target?: EventTarget | null,
  ) => {
    if (pos && typeof document !== "undefined" && typeof document.elementFromPoint === "function") {
      const el = document.elementFromPoint(pos.clientX, pos.clientY);
      if (el) return isCompanionHitTarget(el);
    }
    const fallback = target ?? lastTargetRef.current;
    if (fallback) return isCompanionHitTarget(fallback);
    return false;
  }, []);

  useEffect(() => {
    setCompanionScale(loadNiaCompanionScale());
    return subscribeToNiaCompanionScale(setCompanionScale);
  }, []);

  useEffect(() => {
    if (!bridge) return;
    const transport = new NiaRealtimeTransport();
    transportRef.current = transport;
    const onReport = (report: CompanionTransportReport) => {
      if (report.type === "state") setStatus(report.state);
      if (report.type === "failed") setStatus("failed");
      if (report.type === "closed") setStatus("resting");
      if (report.type === "heard" || report.type === "said") {
        setLastText(report.text);

      }
    };
    const onCommand = (raw: unknown) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof (raw as { type?: unknown }).type !== "string") return;
      const command = raw as CompanionCommand;
      if (command.type === "open") {
        setStatus("opening");
        void transport.open(command.generation, {
          report: onReport,
          playAudio: (stream) => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.srcObject = stream;
            connectAudio(stream, audio);
            void audio.play().catch(() => undefined);
          },
        });
      } else if (command.type === "close") {
        transport.close(command.generation);
        setStatus("resting");
      } else if (command.type === "text") {
        transport.sendText(command.text);
      } else if (command.type === "reminder") {
        setLastText(`有 ${command.reminder.count} 个内容待复习`);
        transport.sendReminder(command.reminder);
      } else if (command.type === "config") {
        transport.sendConfig(command.config);
      } else if (command.type === "mute") {
        transport.setMuted(command.muted);
      }
    };
    bridge.subscribe(onCommand);
    bridge.ready({ version: 1 });
    return () => {
      bridge.unsubscribe(onCommand);
      transport.close();
      stopAudio();
      transportRef.current = null;
    };
  }, [bridge, connectAudio, stopAudio]);

  const endPointer = useCallback((event?: PointerEvent<HTMLElement> | globalThis.PointerEvent) => {
    if (!bridge || !isDraggingRef.current) return;
    isDraggingRef.current = false;
    setDragging(false);

    if (event && typeof event.clientX === "number" && typeof event.clientY === "number") {
      lastPointerPosRef.current = { clientX: event.clientX, clientY: event.clientY };
    }
    if (event?.target) {
      lastTargetRef.current = event.target;
    }

    const isHit = checkPointerHit(lastPointerPosRef.current, event?.target);
    void bridge.dragEnd({ retainCapture: isHit });
    setCompanionPointerCapture(isHit);
  }, [bridge, checkPointerHit, setCompanionPointerCapture]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !bridge) return;
    lastPointerPosRef.current = { clientX: event.clientX, clientY: event.clientY };
    lastTargetRef.current = event.target;
    if (!checkPointerHit(lastPointerPosRef.current, event.target)) return;
    if ((event.target as HTMLElement).closest("button")) return;
    playMotion("poke");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    isDraggingRef.current = true;
    setDragging(true);
    setCompanionPointerCapture(true);
    void bridge.wake();
    void bridge.dragBegin(event.screenX, event.screenY);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const rect = figureRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      lookAt((event.clientX - rect.left - rect.width / 2) / (rect.width / 2), (event.clientY - rect.top - rect.height / 2) / (rect.height / 2));
    }
    if (!bridge) return;
    lastPointerPosRef.current = { clientX: event.clientX, clientY: event.clientY };
    lastTargetRef.current = event.target;
    if (isDraggingRef.current) {
      if (typeof event.buttons === "number" && (event.buttons & 1) === 0) {
        endPointer(event);
        return;
      }
      void bridge.dragTo(event.screenX, event.screenY);
      return;
    }
    setCompanionPointerCapture(checkPointerHit(lastPointerPosRef.current, event.target));
  };

  const onPointerEnter = (event: PointerEvent<HTMLElement>) => {
    lastPointerPosRef.current = { clientX: event.clientX, clientY: event.clientY };
    lastTargetRef.current = event.target;
    if (!isDraggingRef.current) {
      setCompanionPointerCapture(checkPointerHit(lastPointerPosRef.current, event.target));
    }
  };

  const onPointerLeave = () => {
    lookAt(0, 0);
    if (!isDraggingRef.current) {
      lastPointerPosRef.current = null;
      lastTargetRef.current = null;
      setCompanionPointerCapture(false);
    }
  };

  useEffect(() => {
    const handleGlobalPointerUp = (event: globalThis.PointerEvent) => {
      if (isDraggingRef.current) {
        endPointer(event);
      }
    };
    const handleWindowBlur = () => {
      if (isDraggingRef.current) {
        endPointer();
      }
    };
    const handleWindowMouseLeave = () => {
      if (!isDraggingRef.current) {
        lastPointerPosRef.current = null;
        lastTargetRef.current = null;
        setCompanionPointerCapture(false);
      }
    };
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    window.addEventListener("lostpointercapture", handleGlobalPointerUp);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("mouseleave", handleWindowMouseLeave);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
      window.removeEventListener("lostpointercapture", handleGlobalPointerUp);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("mouseleave", handleWindowMouseLeave);
    };
  }, [endPointer, setCompanionPointerCapture]);

  useEffect(() => {
    if (!bridge || typeof requestAnimationFrame !== "function") return;
    let animFrameId: number | null = null;
    const tick = () => {
      if (!isDraggingRef.current && lastPointerPosRef.current) {
        const isHit = checkPointerHit(lastPointerPosRef.current);
        setCompanionPointerCapture(isHit);
      }
      animFrameId = requestAnimationFrame(tick);
    };
    animFrameId = requestAnimationFrame(tick);
    return () => {
      if (animFrameId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(animFrameId);
      }
    };
  }, [bridge, checkPointerHit, setCompanionPointerCapture]);

  return (
    <main
      aria-label="Nia desktop companion"
      className={`nia-companion nia-companion--${status}`}
      data-dragging={isDragging ? "true" : "false"}
      onLostPointerCapture={(event) => {
        if (isDraggingRef.current) {
          endPointer(event);
        }
      }}
      onPointerCancel={endPointer}
      onContextMenu={(event) => {
        event.preventDefault();
        lastPointerPosRef.current = { clientX: event.clientX, clientY: event.clientY };
        lastTargetRef.current = event.target;
        if (!checkPointerHit(lastPointerPosRef.current, event.target)) return;
        void bridge?.showMenu();
      }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
    >
      <audio aria-hidden="true" ref={audioRef} />
      <p aria-live="polite" className="nia-companion__spoken-status">{readableStatus(status)}{lastText ? `：${lastText}` : ""}</p>
      <div
        className="nia-companion__figure"
        data-drift={driftEnabled}
        data-expression={expression}
        data-asleep={asleep}
        ref={figureRef}
        role="img"
        aria-label="Nia"
        style={{
          "--nia-companion-scale": companionScale / 100,
          "--nia-expression-intensity": intensity,
        } as CSSProperties}
      >
        <div className="nia-companion__rig" ref={rigRef}>
        <i className="nia-companion__halo" />
        <div className="nia-companion__head" data-nia-companion-hit-region><div className="nia-companion__face"><i className="nia-companion__eye nia-companion__eye--left" /><i className="nia-companion__eye nia-companion__eye--right" /><i className="nia-companion__mouth" /></div></div>
        <div className="nia-companion__body" data-nia-companion-hit-region><i className="nia-companion__arm nia-companion__arm--left" /><i className="nia-companion__arm nia-companion__arm--right" /><i className="nia-companion__chest" /></div>
        </div>
      </div>
    </main>
  );
}
