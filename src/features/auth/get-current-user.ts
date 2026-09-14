import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import {
  DEMO_AUTH_COOKIE_NAME,
  decodeDemoAuthCookieValue,
} from "@/features/auth/demo-auth";
import { getOptionalSupabaseEnv } from "@/lib/env";

export type AuthUser = {
  id: string;
  email?: string | null;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const env = getOptionalSupabaseEnv();

  if (!env) {
    const cookieStore = await cookies();

    return decodeDemoAuthCookieValue(
      cookieStore.get(DEMO_AUTH_COOKIE_NAME)?.value,
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}
