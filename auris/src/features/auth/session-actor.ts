import type { AuthUser } from "@/features/auth/get-current-user";
import { getCurrentUser } from "@/features/auth/get-current-user";

export const LOCAL_DESKTOP_SESSION_USER_ID = "desktop-local-user";

function parseRequestUrl(request?: Request) {
  if (!request) {
    return null;
  }

  try {
    return new URL(request.url);
  } catch {
    return null;
  }
}

export function isDesktopLocalRequest(request?: Request) {
  if (!request) {
    return false;
  }

  if (request.headers.get("x-shadowing-client") === "desktop") {
    return true;
  }

  return parseRequestUrl(request)?.searchParams.get("localDesktop") === "1";
}

export function isLocalDesktopSessionUserId(userId: string) {
  return userId === LOCAL_DESKTOP_SESSION_USER_ID;
}

export async function getSessionActor(request?: Request): Promise<AuthUser | null> {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    return currentUser;
  }

  if (!isDesktopLocalRequest(request)) {
    return null;
  }

  return {
    id: LOCAL_DESKTOP_SESSION_USER_ID,
    email: null,
  };
}

export async function requireSessionActor(request?: Request) {
  const actor = await getSessionActor(request);

  if (!actor) {
    throw new Error("AUTH_REQUIRED");
  }

  return actor;
}
