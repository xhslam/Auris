"use strict";

const ACTIVE_STATES = new Set(["opening", "listening", "attending", "thinking", "speaking", "working"]);

function createCompanionMenuTemplate({ snapshot = {}, handlers = {}, appName = "Auris" } = {}) {
  const active = ACTIVE_STATES.has(snapshot.state);
  return [
    { label: "打开 Nia", click: handlers.onOpen },
    { type: "separator" },
    active
      ? { label: snapshot.muted ? "取消静音" : "静音", click: handlers.onToggleMute }
      : { label: "开始实时语音", click: handlers.onWake },
    ...(active ? [{ label: "让 Nia 休息", click: handlers.onRest }] : []),
    { type: "separator" },
    { label: "隐藏桌面形象", click: handlers.onHide },
    { type: "separator" },
    { label: `退出 ${appName}`, click: handlers.onQuit },
  ];
}

module.exports = { ACTIVE_STATES, createCompanionMenuTemplate };
