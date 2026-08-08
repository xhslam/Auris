import { NotesPageClient } from "@/components/notes-v2/notes-page-client";

type NotesPageProps = {
  searchParams?: Promise<{
    resumeNoteId?: string | string[];
  }>;
};

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resumeNoteId = Array.isArray(resolvedSearchParams?.resumeNoteId)
    ? resolvedSearchParams?.resumeNoteId[0]
    : resolvedSearchParams?.resumeNoteId;

  return <NotesPageClient resumeNoteId={resumeNoteId ?? null} />;
}
