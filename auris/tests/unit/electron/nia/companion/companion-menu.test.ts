import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createCompanionMenuTemplate } = require("../../../../../electron/nia/companion/companion-menu.cjs");

function labels(template: Array<{ label?: string }>) {
  return template.flatMap((item) => item.label ? [item.label] : []);
}

describe("Nia 桌面形象菜单", () => {
  it("休息时提供开始语音、隐藏、打开和退出", () => {
    const handlers = { onOpen: vi.fn(), onWake: vi.fn(), onHide: vi.fn(), onQuit: vi.fn() };
    const template = createCompanionMenuTemplate({ appName: "Auris", handlers, snapshot: { state: "resting", muted: false } });
    expect(labels(template)).toEqual(["打开 Nia", "开始实时语音", "隐藏桌面形象", "退出 Auris"]);
    template.find((item: { label?: string }) => item.label === "开始实时语音")?.click();
    expect(handlers.onWake).toHaveBeenCalledOnce();
  });

  it("会话中提供静音切换和休息动作", () => {
    const handlers = { onToggleMute: vi.fn(), onRest: vi.fn() };
    const active = createCompanionMenuTemplate({ handlers, snapshot: { state: "listening", muted: false } });
    expect(labels(active)).toContain("静音");
    expect(labels(active)).toContain("让 Nia 休息");
    const muted = createCompanionMenuTemplate({ handlers, snapshot: { state: "speaking", muted: true } });
    expect(labels(muted)).toContain("取消静音");
    expect(labels(muted)).not.toContain("开始实时语音");
  });
});
