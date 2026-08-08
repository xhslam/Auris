import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260318_000002_rls_and_storage_policies.sql",
);

describe("Supabase RLS migration", () => {
  it("defines row-level security for product tables and storage objects", () => {
    const sql = readFileSync(migrationPath, "utf-8");

    expect(sql).toContain("alter table public.sessions enable row level security");
    expect(sql).toContain("alter table public.sentences enable row level security");
    expect(sql).toContain("alter table public.word_tokens enable row level security");
    expect(sql).toContain("alter table public.templates enable row level security");
    expect(sql).toContain("create policy \"Users can read own sessions\"");
    expect(sql).toContain("create policy \"Users can read own sentences\"");
    expect(sql).toContain("create policy \"Users can read own word tokens\"");
    expect(sql).toContain("create policy \"Authenticated users can read templates\"");
    expect(sql).toContain("create policy \"Users can read own audio objects\"");
    expect(sql).toContain("create policy \"Users can upload own audio objects\"");
  });
});
