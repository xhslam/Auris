import { ReviewPageClient } from "@/components/review/review-page-client";

type ReviewPageProps = {
  searchParams?: Promise<{
    intent?: string | string[];
    knowledgePointId?: string | string[];
  }>;
};

function firstString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const intent = firstString(resolvedSearchParams?.intent);
  const rawKnowledgePointId = firstString(resolvedSearchParams?.knowledgePointId);
  const knowledgePointId = rawKnowledgePointId?.trim().slice(0, 128) || null;

  return (
    <ReviewPageClient
      initialIntent={intent === "create-knowledge-point" ? intent : null}
      initialKnowledgePointId={knowledgePointId}
    />
  );
}
