import {
  getSessionArtifacts,
  getSessionById,
} from "@/server/repositories/session-repository";
import type { SessionPlayback } from "@/features/sessions/session.types";

export async function getSessionPlayback(sessionId: string): Promise<SessionPlayback> {
  const session = await getSessionById(sessionId);

  if (!session) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const artifacts = await getSessionArtifacts(sessionId);

  return {
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      audioUrl: session.audioUrl,
      durationMs: session.durationMs,
      speedDefault: session.speedDefault,
      voiceId: session.voiceId,
    },
    sentences: artifacts.sentences,
    wordTokens: artifacts.wordTokens,
  };
}
