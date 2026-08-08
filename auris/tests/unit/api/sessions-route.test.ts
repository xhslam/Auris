import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GET, POST } from "@/app/api/sessions/route";
import { getCurrentUser } from "@/features/auth/get-current-user";
import { __setLocalPersistenceRootForTests } from "@/server/repositories/local-persistence";
import { createEmptySessionRecord } from "@/server/repositories/session-repository";

vi.mock("@/features/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(),
}));

describe("GET /api/sessions", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "sessions-route-"));
    __setLocalPersistenceRootForTests(tempRoot);
    vi.mocked(getCurrentUser).mockReset();
  });

  afterEach(async () => {
    __setLocalPersistenceRootForTests(null);
    await rm(tempRoot, { force: true, recursive: true });
  });

  it("returns recent sessions ordered by latest update for the current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "demo-user",
      email: "demo@example.com",
    });

    await createEmptySessionRecord({
      userId: "demo-user",
      sourceType: "paste",
      title: "First Session",
      originalText: "First text",
    });

    await createEmptySessionRecord({
      userId: "demo-user",
      sourceType: "paste",
      title: "Second Session",
      originalText: "Second text",
    });

    const response = await GET(new Request("http://localhost/api/sessions"));
    const payload = (await response.json()) as {
      sessions: Array<{ title: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.sessions[0]?.title).toBe("Second Session");
    expect(payload.sessions[1]?.title).toBe("First Session");
  });
});

describe("POST /api/sessions", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "sessions-route-"));
    __setLocalPersistenceRootForTests(tempRoot);
    vi.mocked(getCurrentUser).mockReset();
  });

  afterEach(async () => {
    __setLocalPersistenceRootForTests(null);
    await rm(tempRoot, { force: true, recursive: true });
  });

  it("rejects unauthenticated session creation requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          sourceType: "paste",
          title: "Blocked Session",
          text: "Shadowing copy",
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });

  it("creates a local desktop session when the desktop client is unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: {
          "x-shadowing-client": "desktop",
        },
        body: JSON.stringify({
          sourceType: "paste",
          title: "Desktop Session",
          text: "Shadowing copy",
        }),
      }),
    );

    const payload = (await response.json()) as { session?: { id: string } };

    expect(response.status).toBe(201);
    expect(payload.session?.id).toBeTruthy();

    const recentResponse = await GET(
      new Request("http://localhost/api/sessions", {
        headers: {
          "x-shadowing-client": "desktop",
        },
      }),
    );
    const recentPayload = (await recentResponse.json()) as {
      sessions: Array<{ title: string }>;
    };

    expect(recentResponse.status).toBe(200);
    expect(recentPayload.sessions).toEqual([
      expect.objectContaining({ title: "Desktop Session" }),
    ]);
  });
});
