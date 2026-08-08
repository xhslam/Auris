import { listRecentSessionsByUser } from "@/server/repositories/session-repository";

export async function listRecentSessions(userId: string) {
  return listRecentSessionsByUser(userId);
}
