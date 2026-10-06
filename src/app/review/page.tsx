import { redirect } from "next/navigation";

type ReviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// Keep reminder links and bookmarked knowledge points working after Review moves home.
export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved ?? {})) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, entry);
    }
  }
  const suffix = query.toString();
  redirect(suffix ? `/?${suffix}` : "/");
}
