import type { AuthUser } from "@/features/auth/get-current-user";

export async function requireUser(user: AuthUser | null) {
  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  return user;
}
