import { randomUUID } from "crypto";
import type { TemplateRecord } from "@/features/sessions/session.types";
import { getOptionalSupabaseAdminClient } from "@/lib/supabase/admin-client";

type TemplateRow = {
  id: string;
  title: string;
  description: string;
  text: string;
  difficulty: TemplateRecord["difficulty"];
};

type TemplateRepositoryBackend = {
  listStarterTemplates: () => Promise<TemplateRecord[]>;
};

const starterTemplates: TemplateRecord[] = [
  {
    id: randomUUID(),
    title: "TED Shadowing Pack",
    description: "适合练节奏感和重音切换。",
    text: "Learning a language is not only about vocabulary, but also about rhythm.",
    difficulty: "medium",
  },
  {
    id: randomUUID(),
    title: "Daily News Warm-up",
    description: "适合晨间 2 分钟快速开练。",
    text: "Today we will focus on clarity, confidence, and speaking with better pacing.",
    difficulty: "easy",
  },
];

let backendOverride: TemplateRepositoryBackend | null = null;

function mapTemplateRow(row: TemplateRow): TemplateRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    text: row.text,
    difficulty: row.difficulty,
  };
}

const memoryBackend: TemplateRepositoryBackend = {
  async listStarterTemplates() {
    return starterTemplates;
  },
};

const supabaseBackend: TemplateRepositoryBackend = {
  async listStarterTemplates() {
    const supabase = getOptionalSupabaseAdminClient();

    if (!supabase) {
      return memoryBackend.listStarterTemplates();
    }

    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("difficulty", { ascending: true })
      .order("title", { ascending: true });

    if (error || !data) {
      return memoryBackend.listStarterTemplates();
    }

    return (data as TemplateRow[]).map(mapTemplateRow);
  },
};

function getActiveBackend() {
  return backendOverride ?? supabaseBackend;
}

export function __setTemplateRepositoryBackendForTests(
  backend: TemplateRepositoryBackend | null,
) {
  backendOverride = backend;
}

export async function listStarterTemplates() {
  return getActiveBackend().listStarterTemplates();
}
