import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { ReadingScreen } from "@/components/reading/reading-screen";

type ReadingPageProps = {
  searchParams?: Promise<{ sourceId?: string | string[] }>;
};

export default async function ReadingPage({ searchParams }: ReadingPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const sourceId = Array.isArray(resolvedSearchParams?.sourceId)
    ? resolvedSearchParams.sourceId[0]
    : resolvedSearchParams?.sourceId;

  return (
    <DesktopAppFrame
      activeNavId="reading"
      activeWorkspace="workspace"
      subtitle="Reading"
      title="Reading"
    >
      <ReadingScreen initialSourceId={sourceId ?? null} />
    </DesktopAppFrame>
  );
}
