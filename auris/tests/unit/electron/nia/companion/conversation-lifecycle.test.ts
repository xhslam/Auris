import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createConversationLifecycle } = require("../../../../../electron/nia/companion/conversation-lifecycle.cjs");

function fakeStore() {
  const rows: unknown[] = [];
  return {
    rows,
    begin(input: unknown) { const id = `c-${rows.length + 1}`; rows.push({ type: "begin", id, input }); return id; },
    end(id: string) { rows.push({ type: "end", id }); },
    say(input: unknown) { rows.push({ type: "say", input }); return true; },
    tool(input: unknown) { rows.push({ type: "tool", input }); return true; },
  };
}

describe("Nia conversation lifecycle", () => {
  it("lazily starts on the first real turn and flushes an earlier tool event", () => {
    const store = fakeStore();
    const talk = createConversationLifecycle({ store, personaId: "nia", now: () => 10 });
    expect(talk.tool("list_due_reviews", "call-1")).toBe(false);
    expect(store.rows).toEqual([]);
    expect(talk.file("user", "")).toBe(false);
    expect(talk.file("user", "开始")).toBe(true);
    expect(store.rows.map((row: any) => row.type)).toEqual(["begin", "tool", "say"]);
  });

  it("ends before persona changes and allows a fresh conversation after deletion", () => {
    const store = fakeStore();
    const talk = createConversationLifecycle({ store, personaId: "nia", now: () => 10 });
    talk.file("user", "一");
    const token = talk.liveToken();
    talk.wear("other");
    expect(store.rows.map((row: any) => row.type)).toEqual(["begin", "say", "end"]);
    expect(talk.isLive()).toBe(false);
    talk.file("user", "二");
    expect(talk.isLive()).toBe(true);
    talk.forget(talk.liveToken());
    expect(talk.isLive()).toBe(false);
    expect(token).toBe("c-1");
  });
});
