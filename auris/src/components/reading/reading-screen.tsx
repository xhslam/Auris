"use client";

import { Suspense, useState } from "react";
import { ReadingLibrary } from "@/components/reading/reading-library";
import { ReadingWorkbench } from "@/components/reading/reading-workbench";
import type { ReadingSource } from "@/features/reading/reading-fixtures";

/**
 * 内容库 ↔ 阅读器的单页切换：
 * 默认显示 Curated Reads 列表，点开某篇进入阅读器，阅读器顶部「内容库」可返回。
 */
export function ReadingScreen({ initialSourceId = null }: { initialSourceId?: string | null }) {
  const [activeSourceId, setActiveSourceId] = useState<string | null>(initialSourceId);
  const [sessionSources, setSessionSources] = useState<ReadingSource[]>([]);

  function rememberImportedSource(source: ReadingSource) {
    setSessionSources((currentSources) => [
      source,
      ...currentSources.filter((item) => item.id !== source.id),
    ]);
  }

  if (activeSourceId) {
    return (
      <ReadingWorkbench
        initialSourceId={activeSourceId}
        key={activeSourceId}
        onExit={() => setActiveSourceId(null)}
        sessionSources={sessionSources}
      />
    );
  }

  return (
    <Suspense fallback={null}>
      <ReadingLibrary
        onImported={rememberImportedSource}
        onOpen={(sourceId) => setActiveSourceId(sourceId)}
        sessionSources={sessionSources}
      />
    </Suspense>
  );
}
