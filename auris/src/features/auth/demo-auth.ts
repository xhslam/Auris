import type { AuthUser } from "@/features/auth/get-current-user";

export const DEMO_AUTH_COOKIE_NAME = "shadowing_demo_auth";

function slugifyIdentifier(identifier: string) {
  return identifier
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildDemoAuthUser(identifier: string): AuthUser | null {
  const trimmed = identifier.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("@")) {
    const normalizedEmail = trimmed.toLowerCase();
    const slug = slugifyIdentifier(normalizedEmail);

    if (!slug) {
      return null;
    }

    return {
      email: normalizedEmail,
      id: `demo-user-${slug}`,
    };
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length < 6) {
    return null;
  }

  return {
    email: `${digits}@demo.local`,
    id: `demo-user-${digits}`,
  };
}

export function encodeDemoAuthCookieValue(user: AuthUser) {
  return encodeURIComponent(JSON.stringify(user));
}

export function decodeDemoAuthCookieValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<AuthUser>;

    if (typeof parsed.id !== "string" || parsed.id.length === 0) {
      return null;
    }

    return {
      email: typeof parsed.email === "string" ? parsed.email : null,
      id: parsed.id,
    } satisfies AuthUser;
  } catch {
    return null;
  }
}
