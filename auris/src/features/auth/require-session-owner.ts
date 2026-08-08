import { requireSessionActor } from "@/features/auth/session-actor";

export async function requireSessionOwner(sessionUserId: string, request?: Request) {
  const actor = await requireSessionActor(request);

  if (actor.id !== sessionUserId) {
    throw new Error("SESSION_FORBIDDEN");
  }

  return actor;
}
