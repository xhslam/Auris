import { describe, expect, it } from "vitest";
import { requireUser } from "@/features/auth/require-user";
import { createSession } from "@/features/sessions/create-session";
import { createEmptySessionRecord } from "@/server/repositories/session-repository";

describe("requireUser", () => {
  it("throws when no authenticated user is present", async () => {
    await expect(requireUser(null)).rejects.toThrow("AUTH_REQUIRED");
  });
});

describe("createEmptySessionRecord", () => {
  it("persists a paste-backed draft session", async () => {
    const session = await createEmptySessionRecord({
      userId: "user-1",
      sourceType: "paste",
      originalText: "Hello world.",
      title: "Greeting",
    });

    expect(session.status).toBe("draft");
    expect(session.sourceType).toBe("paste");
    expect(session.originalText).toBe("Hello world.");
  });
});

describe("createSession", () => {
  it("normalizes pasted text and creates a draft session", async () => {
    const session = await createSession({
      user: { id: "user-2", email: "demo@example.com" },
      sourceType: "paste",
      title: "Intro",
      text: "Hello\nworld.",
    });

    expect(session.status).toBe("draft");
    expect(session.normalizedText).toBe("Hello world.");
  });
});
