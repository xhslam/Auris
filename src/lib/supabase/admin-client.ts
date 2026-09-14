import { createClient } from "@supabase/supabase-js";
import { getOptionalSupabaseEnv } from "@/lib/env";
import { getOptionalServerOnlyEnv } from "@/lib/server-env";

export function getOptionalSupabaseAdminClient() {
  const supabaseEnv = getOptionalSupabaseEnv();
  const serverOnlyEnv = getOptionalServerOnlyEnv();

  if (!supabaseEnv || !serverOnlyEnv) {
    return null;
  }

  return createClient(
    supabaseEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverOnlyEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
