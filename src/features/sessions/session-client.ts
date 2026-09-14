/**
 * Client-side session service.
 * Wraps the two-step "create session → prepare playback" fetch sequence
 * so callers do not duplicate raw network code.
 */

import { createDesktopClientHeaders } from "@/platform/desktop/desktop-request";
import type { SessionSourceType } from "@/features/sessions/session.types";

export type CreateAndPrepareSessionInput = {
  sourceType: SessionSourceType;
  text: string;
  title: string;
  voiceId: string;
};

export type CreateAndPrepareSessionResult = {
  /** The prepared playback session ID (used as audio source key). */
  sessionId: string;
  /** Absolute path to the generated audio stream. */
  audioPath: string;
};

type CreateSessionResponse = {
  message?: string;
  session?: { id: string };
};

type PreparePlaybackResponse = {
  message?: string;
  playback?: { sessionId?: string };
};

export async function createAndPrepareSession(
  input: CreateAndPrepareSessionInput,
): Promise<CreateAndPrepareSessionResult> {
  const createResponse = await fetch("/api/sessions", {
    body: JSON.stringify({
      sourceType: input.sourceType,
      text: input.text,
      title: input.title,
    }),
    headers: createDesktopClientHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  const createPayload = (await createResponse.json()) as CreateSessionResponse;

  if (!createResponse.ok || !createPayload.session?.id) {
    throw new Error(createPayload.message ?? "创建训练会话失败。");
  }

  const prepareResponse = await fetch(`/api/sessions/${createPayload.session.id}/prepare`, {
    body: JSON.stringify({ voiceId: input.voiceId }),
    headers: createDesktopClientHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  const preparePayload = (await prepareResponse.json()) as PreparePlaybackResponse;

  if (!prepareResponse.ok || !preparePayload.playback?.sessionId) {
    throw new Error(preparePayload.message ?? "生成训练音频失败。");
  }

  return {
    sessionId: preparePayload.playback.sessionId,
    audioPath: `/api/audio/${preparePayload.playback.sessionId}`,
  };
}
