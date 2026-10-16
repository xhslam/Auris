import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentUser } from "@/features/auth/get-current-user";
import { GET as getAudioRoute } from "@/app/api/audio/[sessionId]/route";
import { GET as getPlaybackRoute } from "@/app/api/sessions/[sessionId]/playback/route";
import { POST as postPrepareRoute } from "@/app/api/sessions/[sessionId]/prepare/route";
import {
  createEmptySessionRecord,
  savePreparedSessionArtifacts,
} from "@/server/repositories/session-repository";
import { saveAudioAsset } from "@/server/repositories/audio-asset-repository";
import { __setLocalPersistenceRootForTests } from "@/server/repositories/local-persistence";

vi.mock("@/features/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(),
}));

describe("session ownership guards", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(process.cwd(), ".tmp-session-auth-"));
    __setLocalPersistenceRootForTests(tempRoot);
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "intruder-user",
      email: "intruder@example.com",
    });
  });

  afterEach(async () => {
    __setLocalPersistenceRootForTests(null);
    await rm(tempRoot, { force: true, recursive: true });
  });

  it("rejects prepare when the session belongs to another user", async () => {
    const session = await createEmptySessionRecord({
      userId: "owner-user",
      sourceType: "paste",
      title: "Owner Session",
      originalText: "Shadowing copy",
    });

    const response = await postPrepareRoute(
      new Request("http://localhost/api/sessions/prepare", {
        method: "POST",
        body: JSON.stringify({ voiceId: "alloy" }),
      }),
      { params: Promise.resolve({ sessionId: session.id }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "SESSION_FORBIDDEN",
    });
  });

  it("rejects playback when the session belongs to another user", async () => {
    const session = await createEmptySessionRecord({
      userId: "owner-user",
      sourceType: "paste",
      title: "Owner Session",
      originalText: "Shadowing copy",
    });

    const response = await getPlaybackRoute(new Request("http://localhost"), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "SESSION_FORBIDDEN",
    });
  });

  it("rejects audio downloads when the session belongs to another user", async () => {
    const session = await createEmptySessionRecord({
      userId: "owner-user",
      sourceType: "paste",
      title: "Owner Session",
      originalText: "Shadowing copy",
    });

    const response = await getAudioRoute(new Request("http://localhost"), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "SESSION_FORBIDDEN",
    });
  });

  it("allows desktop-local playback and audio fetches for local desktop sessions", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const session = await createEmptySessionRecord({
      userId: "desktop-local-user",
      sourceType: "paste",
      title: "Desktop Session",
      originalText: "Shadowing copy",
    });

    await savePreparedSessionArtifacts({
      sessionId: session.id,
      status: "ready",
      audioUrl: `/api/audio/${session.id}`,
      durationMs: 900,
      voiceId: "alloy",
      sentences: [
        {
          id: "sentence-1",
          sessionId: session.id,
          orderIndex: 0,
          text: "Shadowing copy",
          startMs: 0,
          endMs: 900,
        },
      ],
      wordTokens: [
        {
          id: "word-1",
          sentenceId: "sentence-1",
          orderIndex: 0,
          text: "Shadowing",
          startMs: 0,
          endMs: 450,
        },
      ],
    });
    await saveAudioAsset({
      sessionId: session.id,
      audioBuffer: Buffer.from([82, 73, 70, 70, 1, 2, 3]),
      contentType: "audio/wav",
    });

    const playbackResponse = await getPlaybackRoute(
      new Request(`http://localhost/api/sessions/${session.id}/playback`, {
        headers: {
          "x-shadowing-client": "desktop",
        },
      }),
      {
        params: Promise.resolve({ sessionId: session.id }),
      },
    );
    const playbackPayload = (await playbackResponse.json()) as {
      playback: { session: { audioUrl: string } };
    };

    expect(playbackResponse.status).toBe(200);
    expect(playbackPayload.playback.session.audioUrl).toBe(
      `/api/audio/${session.id}?localDesktop=1`,
    );

    const audioResponse = await getAudioRoute(
      new Request(`http://localhost/api/audio/${session.id}?localDesktop=1`),
      {
        params: Promise.resolve({ sessionId: session.id }),
      },
    );

    expect(audioResponse.status).toBe(200);
    expect(audioResponse.headers.get("content-type")).toBe("audio/wav");
  });
});
