"use client";

/** Strict, offline Mermaid rendering, serialized around Mermaid's global configuration. */
import type { AppThemeId } from "@/features/appearance/app-theme";
import { normalizeContentMermaid } from "@/features/notes/graph/content-mermaid";

let queue: Promise<unknown> = Promise.resolve();

// Scoped by Mermaid to the SVG. Colors resolve against the surrounding Notes theme.
const flowchartStyles = `
  .node rect.basic {
    rx: 8px;
    ry: 8px;
  }
  .node .label-container {
    fill: var(--notes-surface);
    stroke: var(--notes-line-strong);
    filter: none;
  }
  .node text {
    fill: var(--notes-ink);
  }
  .cluster > rect {
    rx: 16px;
    ry: 16px;
    fill: color-mix(in srgb, var(--notes-bg) 95%, var(--notes-ink));
    stroke: var(--notes-line);
    filter: none;
  }
  .cluster-label text {
    fill: var(--notes-muted);
    font-weight: 600;
  }
  .flowchart-link {
    stroke: var(--article-graph-edge);
  }
  .marker {
    fill: var(--article-graph-edge);
    stroke: var(--article-graph-edge);
  }
  .edgeLabel text {
    fill: var(--notes-muted);
  }
  .edgeLabel rect {
    fill: var(--notes-bg);
    opacity: 1;
  }
  .node.topic .label-container {
    fill: color-mix(in srgb, var(--notes-surface) 78%, var(--article-graph-accent));
    stroke: var(--article-graph-accent);
  }
  .node.takeaway .label-container {
    fill: color-mix(in srgb, var(--notes-surface) 90%, var(--article-graph-accent));
    stroke: color-mix(in srgb, var(--notes-line-strong) 60%, var(--article-graph-accent));
  }
  .node.topic text, .node.takeaway text {
    font-weight: 600;
  }
`;

export function renderArticleMermaid(
  code: string,
  theme: AppThemeId,
  { fontFamily, fontSize }: { fontFamily: string; fontSize: string },
) {
  const render = queue.catch(() => undefined).then(async () => {
    const { default: mermaid } = await import("mermaid");
    const source = normalizeContentMermaid(code);
    const isFlowchart = /^\s*(?:%%[^\n]*\n\s*)*(?:flowchart|graph)\b/u.test(source);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "night" || theme === "solarized" ? "dark" : "neutral",
      fontFamily,
      themeVariables: { fontFamily, fontSize },
      suppressErrorRendering: true,
      maxTextSize: 50_000,
      ...(isFlowchart && {
        htmlLabels: false,
        look: "classic",
        themeCSS: flowchartStyles,
        flowchart: {
          curve: "basis",
          nodeSpacing: 28,
          rankSpacing: 44,
          padding: 16,
          wrappingWidth: 240,
          subGraphTitleMargin: { top: 8, bottom: 12 },
        },
      }),
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
