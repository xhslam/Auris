"use client";

/** Strict, offline Mermaid rendering, serialized around Mermaid's global configuration. */
import type { AppThemeId } from "@/features/appearance/app-theme";
import { normalizeContentMermaid } from "@/features/notes/graph/content-mermaid";

let queue: Promise<unknown> = Promise.resolve();

export function renderArticleMermaid(code: string, theme: AppThemeId) {
  const render = queue.catch(() => undefined).then(async () => {
    const { default: mermaid } = await import("mermaid");
    const source = normalizeContentMermaid(code);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "night" || theme === "solarized" ? "dark" : "neutral",
      suppressErrorRendering: true,
      maxTextSize: 50_000,
      flowchart: { htmlLabels: false },
    });
    const id = `article-mermaid-${crypto.randomUUID()}`;
    try {
      const { svg } = await mermaid.render(id, source);
      // No bindFunctions: diagrams are previews, not interactive script/link surfaces.
      return svg;
    } finally {
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = render;
  return render;
}
