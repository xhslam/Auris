import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createConversationStore } = require("../../../../../electron/nia/companion/conversation-db.cjs");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function store() { const root = mkdtempSync(join(tmpdir(), "nia-conversations-")); roots.push(root); return createConversationStore({ databasePath: join(root, "conversations.db"), now: () => Date.parse("2026-09-02T10:00:00.000Z") }); }

describe("Nia conversation store", () => {
  it("stores ordered turns, tools and ends a conversation", () => {
    const db = store();
    const id = db.begin({ personaId: "nia", source: "realtime" });
    expect(db.say({ conversationId: id, speaker: "user", text: "开始复习", at: Date.parse("2026-09-02T10:00:01Z") })).toBe(true);
    expect(db.tool({ conversationId: id, callId: "call-1", name: "list_due_reviews" })).toBe(true);
    expect(db.say({ conversationId: id, speaker: "nia", text: "今天有三个知识点", at: Date.parse("2026-09-02T10:00:02Z"), cut: true, responseId: "r-1", itemId: "i-1" })).toBe(true);
    db.end(id, Date.parse("2026-09-02T10:01:00Z"));
    expect(db.list({ personaId: "nia" })[0]).toMatchObject({ id, endedAt: "2026-09-02T10:01:00.000Z", turnCount: 2 });
    expect(db.turns({ personaId: "nia", conversationId: id }).map((turn: { speaker: string }) => turn.speaker)).toEqual(["user", "nia"]);
    expect(db.exportFor({ personaId: "nia" })[0].tools).toEqual([expect.objectContaining({ callId: "call-1", name: "list_due_reviews" })]);
    db.close();
  });

  it("does not store empty non-cut turns and respects persona scope", () => {
    const db = store();
    const id = db.begin({ personaId: "nia" });
    expect(db.say({ conversationId: id, speaker: "user", text: "   " })).toBe(false);
    expect(db.turns({ personaId: "other", conversationId: id })).toEqual([]);
    expect(db.search({ personaId: "nia", query: "开始" })).toEqual([]);
    db.close();
  });

  it("recovers open rows, searches bounded text and deletes by persona", () => {
    const db = store();
    const id = db.begin({ personaId: "nia" });
    db.say({ conversationId: id, speaker: "user", text: "复习中值定理" });
    expect(db.search({ personaId: "nia", query: "中值" })[0]).toMatchObject({ conversationId: id, speaker: "user" });
    expect(db.recoverOpen({ endedAt: Date.parse("2026-09-02T11:00:00Z") })).toBe(1);
    expect(db.list({ personaId: "nia" })[0].endedAt).toBe("2026-09-02T11:00:00.000Z");
    expect(db.deleteConversation({ personaId: "other", conversationId: id })).toBe(false);
    expect(db.deleteConversation({ personaId: "nia", conversationId: id })).toBe(true);
    expect(db.list({ personaId: "nia" })).toEqual([]);
    db.close();
  });
});
