"use client";

import { WidgetType } from "@codemirror/view";
import katex from "katex";
import mermaid from "mermaid";
import { sanitizeMathContent } from "@/features/notes/markdown/notes-markdown-dialect";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
});

export const DEFAULT_KATEX_MACROS: Record<string, string> = {
  "\\centernot": "\\not",
};

export function renderMathMarkup(text: string, displayMode: boolean) {
  const sanitized = sanitizeMathContent(text);
  return katex.renderToString(sanitized, {
    displayMode,
    strict: false,
    throwOnError: false,
    macros: DEFAULT_KATEX_MACROS,
  });
}

export function normalizeLanguage(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

const SAFE_DATA_IMAGE_PATTERN =
  /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z\d+/=\s]+$/iu;

function hasUriScheme(value: string) {
  return /^[a-z][a-z\d+.-]*:/iu.test(value.trim());
}

function isAllowedExternalImageSource(value: string) {
  const trimmed = value.trim();
  return (
    /^https?:\/\//iu.test(trimmed) || SAFE_DATA_IMAGE_PATTERN.test(trimmed)
  );
}

function namesDirectory(path: string) {
  const last = path.replace(/\\/g, "/").split("/").pop() ?? "";
  return last === "" || last === "." || last === "..";
}

function isSafeRelativeImagePath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized || normalized === "." || normalized === "~") return false;
  if (normalized.startsWith("/") || normalized.startsWith("~/")) return false;
  if (/^[a-z]:\//iu.test(normalized) || hasUriScheme(normalized)) return false;
  if (namesDirectory(normalized)) return false;
  return true;
}

function normalizeVaultPathSegments(path: string): string | null {
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments.join("/");
}

function encodeVaultMediaPath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function resolveMarkdownImageSource(
  source: string,
  notePath: string | null,
  reloadKey = 0,
) {
  const trimmed = source.trim();

  if (!trimmed) {
    return null;
  }

  if (isAllowedExternalImageSource(trimmed)) {
    return trimmed;
  }

  const normalizedSource =
    trimmed.startsWith("<") && trimmed.endsWith(">")
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  if (!normalizedSource) {
    return null;
  }

  if (
    !isAllowedExternalImageSource(normalizedSource) &&
    !isSafeRelativeImagePath(normalizedSource)
  ) {
    return null;
  }

  if (isAllowedExternalImageSource(normalizedSource)) {
    return normalizedSource;
  }

  const noteDirectory = notePath?.split("/").slice(0, -1).join("/") ?? "";
  const resolvedPath = normalizeVaultPathSegments(
    [noteDirectory, normalizedSource].filter(Boolean).join("/"),
  );

  if (!resolvedPath) {
    return null;
  }

  return appendMediaReloadKey(
    `shadowing-media://vault/${encodeVaultMediaPath(resolvedPath)}`,
    reloadKey,
  );
}

export function appendMediaReloadKey(source: string, reloadKey: number) {
  if (
    !source.startsWith("shadowing-media://vault/") ||
    !Number.isSafeInteger(reloadKey) ||
    reloadKey <= 0
  ) {
    return source;
  }

  return `${source}${source.includes("?") ? "&" : "?"}v=${reloadKey}`;
}

export async function renderCodeBlockPreview(
  previewHost: HTMLElement,
  language: string,
  text: string,
  renderToken: number,
  getCurrentToken: () => number,
) {
  previewHost.innerHTML = "";

  if (!text.trim()) {
    return;
  }

  if (language === "mermaid") {
    const diagramId = `notes-mermaid-${crypto.randomUUID()}`;

    try {
      const { svg } = await mermaid.render(diagramId, text);

      if (getCurrentToken() !== renderToken) {
        return;
      }

      previewHost.innerHTML = svg;
    } catch (error: unknown) {
      if (getCurrentToken() !== renderToken) {
        return;
      }

      previewHost.textContent =
        error instanceof Error ? error.message : "Mermaid 渲染失败";
    }

    return;
  }

  if (language === "math" || language === "latex" || language === "katex") {
    try {
      previewHost.innerHTML = renderMathMarkup(text, true);
    } catch (error) {
      if (getCurrentToken() !== renderToken) {
        return;
      }

      previewHost.textContent =
        error instanceof Error ? error.message : "KaTeX 渲染失败";
    }
  }
}

type CodeBlockPreviewWidgetProps = {
  language: string;
  text: string;
};

export class CodeBlockPreviewWidget extends WidgetType {
  private renderVersion = 0;

  constructor(private readonly props: CodeBlockPreviewWidgetProps) {
    super();
  }

  eq(other: CodeBlockPreviewWidget) {
    return (
      other.props.language === this.props.language &&
      other.props.text === this.props.text
    );
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "notes-v2__pm-code-block notes-v2__cm-code-block";

    const pre = document.createElement("pre");
    pre.className = "notes-v2__pm-code-block-source notes-v2__cm-code-block-source";

    const code = document.createElement("code");
    code.className =
      "notes-v2__pm-code-block-content notes-v2__cm-code-block-content";
    code.textContent = this.props.text;
    pre.append(code);

    const previewHost = document.createElement("div");
    previewHost.className =
      "notes-v2__pm-code-block-preview notes-v2__cm-code-block-preview";
    previewHost.setAttribute("aria-hidden", "true");

    wrapper.append(pre, previewHost);

    const currentVersion = ++this.renderVersion;

    void renderCodeBlockPreview(
      previewHost,
      this.props.language,
      this.props.text,
      currentVersion,
      () => this.renderVersion,
    );

    return wrapper;
  }

  destroy() {
    this.renderVersion += 1;
  }
}

type ImagePreviewWidgetProps = {
  alt: string;
  resolvedSrc: string | null;
  source: string;
  title: string;
};

export class ImagePreviewWidget extends WidgetType {
  constructor(private readonly props: ImagePreviewWidgetProps) {
    super();
  }

  eq(other: ImagePreviewWidget) {
    return (
      other.props.alt === this.props.alt &&
      other.props.resolvedSrc === this.props.resolvedSrc &&
      other.props.source === this.props.source &&
      other.props.title === this.props.title
    );
  }

  toDOM() {
    const wrapper = document.createElement("figure");
    wrapper.className = "notes-v2__cm-preview-block notes-v2__cm-image-preview";

    if (!this.props.resolvedSrc) {
      const fallback = document.createElement("div");
      fallback.className = "notes-v2__cm-preview-fallback";
      fallback.textContent = this.props.alt || this.props.title || this.props.source;
      wrapper.append(fallback);
      return wrapper;
    }

    const image = document.createElement("img");
    image.className = "notes-v2__cm-image-preview-media";
    image.loading = "lazy";
    image.alt = this.props.alt || this.props.title || this.props.source;
    image.src = this.props.resolvedSrc;

    if (this.props.title) {
      image.title = this.props.title;
    }

    const fallback = document.createElement("div");
    fallback.className = "notes-v2__cm-preview-fallback";
    fallback.textContent = this.props.alt || this.props.title || this.props.source;
    fallback.hidden = true;

    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
    });

    wrapper.append(image, fallback);
    return wrapper;
  }
}

type MathBlockPreviewWidgetProps = {
  text: string;
};

export class MathBlockPreviewWidget extends WidgetType {
  constructor(private readonly props: MathBlockPreviewWidgetProps) {
    super();
  }

  eq(other: MathBlockPreviewWidget) {
    return other.props.text === this.props.text;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "notes-v2__cm-preview-block notes-v2__cm-math-preview";

    try {
      wrapper.innerHTML = renderMathMarkup(this.props.text, true);
    } catch (error: unknown) {
      wrapper.textContent =
        error instanceof Error ? error.message : "KaTeX 渲染失败";
    }

    return wrapper;
  }
}

type MathInlinePreviewWidgetProps = {
  display?: boolean;
  text: string;
};

export class MathInlinePreviewWidget extends WidgetType {
  constructor(private readonly props: MathInlinePreviewWidgetProps) {
    super();
  }

  eq(other: MathInlinePreviewWidget) {
    return (
      other.props.text === this.props.text &&
      other.props.display === this.props.display
    );
  }

  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = `notes-v2__cm-inline-math-preview${this.props.display ? " notes-v2__cm-inline-math-preview--display" : ""}`;

    try {
      wrapper.innerHTML = renderMathMarkup(this.props.text, this.props.display ?? false);
    } catch (error: unknown) {
      wrapper.textContent =
        error instanceof Error ? error.message : "KaTeX 渲染失败";
    }

    return wrapper;
  }
}
