import { ReviewPageClient } from "@/components/review/review-page-client";

type ReviewPageProps = {
  searchParams?: Promise<{ intent?: string | string[] }>;
};

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const intent = Array.isArray(resolvedSearchParams?.intent)
    ? resolvedSearchParams.intent[0]
    : resolvedSearchParams?.intent;

  return (
    <ReviewPageClient
      initialIntent={intent === "create-knowledge-point" ? intent : null}
    />
  );
}
