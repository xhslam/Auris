import { describe, expect, it } from "vitest";
import { createNiaRealtimePendingTurns } from "@/features/nia/nia-realtime-pending";

describe("Nia pending Realtime turns", () => {
  it("waits for the natural audio-end verdict before filing a known item", () => {
    const pending = createNiaRealtimePendingTurns();
    pending.began("item-1", "resp-1");
    expect(pending.said("item-1", "完整回答", 100)).toBeNull();
    expect(pending.finished("resp-1")).toEqual([
      { at: 100, cut: false, itemId: "item-1", responseId: "resp-1", text: "完整回答" },
    ]);
  });

  it("settles a transcript as interrupted regardless of frame order", () => {
    const transcriptFirst = createNiaRealtimePendingTurns();
    transcriptFirst.began("item-1", "resp-1");
    expect(transcriptFirst.said("item-1", "较长回答", 100)).toBeNull();
    expect(transcriptFirst.truncated("item-1", 120)).toEqual({
      at: 120, cut: true, itemId: "item-1", responseId: "resp-1", text: "较长回答",
    });

    const cutFirst = createNiaRealtimePendingTurns();
    cutFirst.began("item-2", "resp-2");
    expect(cutFirst.truncated("item-2", 200)).toBeNull();
    expect(cutFirst.said("item-2", "迟到回答", 240)).toEqual({
      at: 200, cut: true, itemId: "item-2", responseId: "resp-2", text: "迟到回答",
    });
  });

  it("flushes received or interrupted turns before session close", () => {
    const pending = createNiaRealtimePendingTurns();
    pending.began("item-1", "resp-1");
    pending.said("item-1", "等待结算", 100);
    pending.began("item-2", "resp-2");
    pending.truncated("item-2", 120);
    expect(pending.flush()).toEqual([
      { at: 100, cut: false, itemId: "item-1", responseId: "resp-1", text: "等待结算" },
      { at: 120, cut: true, itemId: "item-2", responseId: "resp-2", text: "" },
    ]);
  });
});
