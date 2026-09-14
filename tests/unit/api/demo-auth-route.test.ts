import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { POST } from "@/app/api/auth/demo-session/route";
import { DEMO_AUTH_COOKIE_NAME } from "@/features/auth/demo-auth";
import {
  __setLocalPersistenceRootForTests,
  readLocalSessionStore,
} from "@/server/repositories/local-persistence";

describe("POST /api/auth/demo-session", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "demo-auth-route-"));
    __setLocalPersistenceRootForTests(tempRoot);
  });

  afterEach(async () => {
    __setLocalPersistenceRootForTests(null);
    await rm(tempRoot, { force: true, recursive: true });
  });

  it("persists the submitted phone account into local storage and sets the demo auth cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/demo-session", {
        method: "POST",
        body: JSON.stringify({
          account: "13800138000",
          password: "password123",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${DEMO_AUTH_COOKIE_NAME}=`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");

    const store = await readLocalSessionStore();

    expect(store.authProfiles).toEqual([
      expect.objectContaining({
        accountIdentifier: "13800138000",
        accountType: "phone",
        id: "demo-user-13800138000",
      }),
    ]);
  });
});
