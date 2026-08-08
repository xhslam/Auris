import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DELETE } from "@/app/api/sessions/[sessionId]/route";
import { getCurrentUser } from "@/features/auth/get-current-user";
import { __setLocalPersistenceRootForTests } from "@/server/repositories/local-persistence";
import {
  createEmptySessionRecord,
  getSessionById,
} from "@/server/repositories/session-repository";

vi.mock("@/features/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(),
}));

describe("DELETE /api/sessions/[sessionId]", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "session-delete-route-"));
    __setLocalPersistenceRootForTests(tempRoot);
    vi.mocked(getCurrentUser).mockReset();
  });

  afterEach(async () => {
    __setLocalPersistenceRootForTests(null);
    await rm(tempRoot, { force: true, recursive: true });
  });

  it("deletes a session owned by the current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "demo-user",
      email: "demo@example.com",
    });

    const session = await createEmptySessionRecord({
      userId: "demo-user",
      sourceType: "paste",
      title: "Delete Me",
      originalText: "Shadowing copy",
    });

    const response = await DELETE(
      new Request("http://localhost/api/sessions/session-1"),
      {
        params: Promise.resolve({ sessionId: session.id }),
      },
    );

    expect(response.status).toBe(200);
    await expect(getSessionById(session.id)).resolves.toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      deletedSessionId: session.id,
    });
  });
});
