import type { AuthProfileRecord } from "@/features/auth/auth-profile.types";
import {
  inferAccountIdentifierType,
  normalizeAccountIdentifier,
} from "@/features/auth/account-identifier";
import { getOptionalSupabaseAdminClient } from "@/lib/supabase/admin-client";
import {
  readLocalSessionStore,
  writeLocalSessionStore,
} from "@/server/repositories/local-persistence";

type UpsertAuthProfileInput = {
  accountIdentifier: string;
  userId: string;
};

type AuthProfileRepositoryBackend = {
  upsertAuthProfile: (
    input: UpsertAuthProfileInput,
  ) => Promise<AuthProfileRecord>;
};

type ProfileRow = {
  id: string;
  account_identifier: string | null;
  account_type: "email" | "phone" | null;
  created_at: string;
  updated_at: string | null;
  last_login_at: string | null;
};

let backendOverride: AuthProfileRepositoryBackend | null = null;

function mapProfileRow(row: ProfileRow): AuthProfileRecord {
  return {
    id: row.id,
    accountIdentifier: row.account_identifier ?? "",
    accountType: row.account_type ?? "email",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    lastLoginAt: row.last_login_at ?? row.created_at,
  };
}

function nextIsoTimestamp() {
  return new Date().toISOString();
}

const localBackend: AuthProfileRepositoryBackend = {
  async upsertAuthProfile(input) {
    const store = await readLocalSessionStore();
    const authProfiles = store.authProfiles ?? [];
    const now = nextIsoTimestamp();
    const normalizedIdentifier = normalizeAccountIdentifier(input.accountIdentifier);
    const accountType = inferAccountIdentifierType(normalizedIdentifier);
    const existing = authProfiles.find((profile) => profile.id === input.userId);

    const record: AuthProfileRecord = existing
      ? {
          ...existing,
          accountIdentifier: normalizedIdentifier,
          accountType,
          lastLoginAt: now,
          updatedAt: now,
        }
      : {
          id: input.userId,
          accountIdentifier: normalizedIdentifier,
          accountType,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        };

    await writeLocalSessionStore({
      ...store,
      authProfiles: existing
        ? authProfiles.map((profile) =>
            profile.id === record.id ? record : profile,
          )
        : [...authProfiles, record],
    });

    return record;
  },
};

const supabaseBackend: AuthProfileRepositoryBackend = {
  async upsertAuthProfile(input) {
    const supabase = getOptionalSupabaseAdminClient();

    if (!supabase) {
      return localBackend.upsertAuthProfile(input);
    }

    const normalizedIdentifier = normalizeAccountIdentifier(input.accountIdentifier);
    const accountType = inferAccountIdentifierType(normalizedIdentifier);
    const now = nextIsoTimestamp();

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: input.userId,
          account_identifier: normalizedIdentifier,
          account_type: accountType,
          last_login_at: now,
          updated_at: now,
        },
        {
          onConflict: "id",
        },
      )
      .select("*")
      .single();

    if (error || !data) {
      return localBackend.upsertAuthProfile(input);
    }

    return mapProfileRow(data as ProfileRow);
  },
};

function getActiveBackend() {
  return backendOverride ?? supabaseBackend;
}

export function __setAuthProfileRepositoryBackendForTests(
  backend: AuthProfileRepositoryBackend | null,
) {
  backendOverride = backend;
}

export async function upsertAuthProfile(input: UpsertAuthProfileInput) {
  return getActiveBackend().upsertAuthProfile(input);
}
