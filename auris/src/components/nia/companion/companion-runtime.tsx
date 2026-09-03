"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { NiaRealtimeTransport, type CompanionBridge, type CompanionTransportReport } from "./realtime-transport";
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
  const [status, setStatus] = useState("resting");
  const [lastText, setLastText] = useState("");
  const [isDragging, setDragging] = useState(false);
  const transportRef = useRef<NiaRealtimeTransport | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bridge = useMemo(() => (typeof window === "undefined" ? null : window.niaCompanion ?? null), []);

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
        if (report.type === "said") setStatus("speaking");
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
            void audio.play().catch(() => undefined);
          },
        }, { microphone: command.reason !== "scheduled-reminder" });
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
      transportRef.current = null;
    };
  }, [bridge]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !bridge) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    void bridge.pointerCapture(true);
    void bridge.wake();
    void bridge.dragBegin(event.screenX, event.screenY);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !bridge) return;
    void bridge.dragTo(event.screenX, event.screenY);
  };

  const endPointer = () => {
    if (!bridge || !isDragging) return;
    setDragging(false);
    void bridge.dragEnd();
    void bridge.pointerCapture(false);
  };

  const onPointerEnter = () => { void bridge?.pointerCapture(true); };
  const onPointerLeave = () => { if (!isDragging) void bridge?.pointerCapture(false); };

  return (
    <main
      aria-label="Nia desktop companion"
      className={`nia-companion nia-companion--${status}`}
      data-dragging={isDragging ? "true" : "false"}
      onPointerCancel={endPointer}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!(event.target as HTMLElement).closest(".nia-companion__figure")) return;
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
      <div className="nia-companion__figure" role="img" aria-label="Nia">
        <i className="nia-companion__halo" />
        <div className="nia-companion__head"><i className="nia-companion__eye nia-companion__eye--left" /><i className="nia-companion__eye nia-companion__eye--right" /><i className="nia-companion__mouth" /></div>
        <div className="nia-companion__body"><i className="nia-companion__arm nia-companion__arm--left" /><i className="nia-companion__arm nia-companion__arm--right" /><i className="nia-companion__chest" /></div>
      </div>
    </main>
  );
}
