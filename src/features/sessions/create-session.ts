import type { AuthUser } from "@/features/auth/get-current-user";
import { requireUser } from "@/features/auth/require-user";
import { normalizeInput } from "@/features/text/normalize-input";
import { createEmptySessionRecord } from "@/server/repositories/session-repository";
import type { SessionSourceType } from "@/features/sessions/session.types";

type CreateSessionInput = {
  user: AuthUser | null;
  sourceType: SessionSourceType;
  title: string;
  text: string;
};

export async function createSession(input: CreateSessionInput) {
  const user = await requireUser(input.user);
  const normalizedText = normalizeInput(input.text);

  return createEmptySessionRecord({
    userId: user.id,
    sourceType: input.sourceType,
    title: input.title.trim() || "Untitled Session",
    originalText: input.text,
    normalizedText,
  });
}
