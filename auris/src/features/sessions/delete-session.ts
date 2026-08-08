import { deleteStoredAudioAsset } from "@/features/storage/audio-storage";
import { deleteSessionRecord } from "@/server/repositories/session-repository";

export async function deleteSession(sessionId: string) {
  await deleteStoredAudioAsset(sessionId);
  await deleteSessionRecord(sessionId);
}
