export type ReaderFontFamily =
  | "publisher"
  | "old-style"
  | "modern"
  | "sans-serif"
  | "humanist"
  | "monospace";

export type ReaderFontWeight = "publisher" | "200" | "400" | "500" | "700";
export type ReaderTextAlign = "publisher" | "start" | "justify";
export type ReaderTheme =
  | "light"
  | "dark"
  | "sepia"
  | "paper"
  | "contrast-1"
  | "contrast-2"
  | "contrast-3";
export type ReaderColumns = "auto" | "single" | "dual";
export type ReaderFlow = "scroll" | "paginated";
export type ReaderSpacingPreset =
  | "publisher"
  | "tight"
  | "balanced"
  | "loose"
  | "accessible"
  | "custom";

export type ReaderSettings = {
  columns: ReaderColumns;
  flow: ReaderFlow;
  fontFamily: ReaderFontFamily;
  fontScale: number;
  fontWeight: ReaderFontWeight;
  hyphens: boolean;
  letterSpacing: number;
  lineHeight: number;
  lineWidth: number;
  normalizeText: boolean;
  pageWidth: number;
  paragraphIndent: number;
  paragraphSpacing: number;
  publisherStyles: boolean;
  spacingPreset: ReaderSpacingPreset;
  textAlign: ReaderTextAlign;
  theme: ReaderTheme;
  ttsPitch: number;
  ttsRate: number;
  ttsVoice: string;
  wordSpacing: number;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  columns: "auto",
  flow: "scroll",
  fontFamily: "old-style",
  fontScale: 1,
  fontWeight: "publisher",
  hyphens: false,
  letterSpacing: 0,
  lineHeight: 1.7,
  lineWidth: 68,
  normalizeText: false,
  pageWidth: 88,
  paragraphIndent: 0,
  paragraphSpacing: 1.3,
  publisherStyles: true,
  spacingPreset: "balanced",
  textAlign: "publisher",
  theme: "light",
  ttsPitch: 1,
  ttsRate: 1,
  ttsVoice: "",
  wordSpacing: 0,
};

export const READER_SETTINGS_STORAGE_KEY = "auris.reading.reader-settings.v1";

const SPACING_PRESETS: Record<
  Exclude<ReaderSpacingPreset, "custom">,
  Pick<
    ReaderSettings,
    "letterSpacing" | "lineHeight" | "paragraphIndent" | "paragraphSpacing" | "wordSpacing"
  >
> = {
  accessible: {
    letterSpacing: 0.04,
    lineHeight: 2,
    paragraphIndent: 0,
    paragraphSpacing: 1.8,
    wordSpacing: 0.12,
  },
  balanced: {
    letterSpacing: 0,
    lineHeight: 1.7,
    paragraphIndent: 0,
    paragraphSpacing: 1.3,
    wordSpacing: 0,
  },
  loose: {
    letterSpacing: 0.02,
    lineHeight: 1.9,
    paragraphIndent: 0,
    paragraphSpacing: 1.7,
    wordSpacing: 0.08,
  },
  publisher: {
    letterSpacing: 0,
    lineHeight: 1.6,
    paragraphIndent: 1.5,
    paragraphSpacing: 0.8,
    wordSpacing: 0,
  },
  tight: {
    letterSpacing: -0.01,
    lineHeight: 1.45,
    paragraphIndent: 0,
    paragraphSpacing: 0.75,
    wordSpacing: -0.02,
  },
};

export function applyReaderSpacingPreset(
  settings: ReaderSettings,
  preset: Exclude<ReaderSpacingPreset, "custom">,
): ReaderSettings {
  return { ...settings, ...SPACING_PRESETS[preset], spacingPreset: preset };
}

export function loadReaderSettings(): ReaderSettings {
  if (typeof window === "undefined") {
    return DEFAULT_READER_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(READER_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_READER_SETTINGS;
    }
    return { ...DEFAULT_READER_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(READER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The live reader state remains usable when storage is unavailable.
  }
}

export function getReaderFontStack(font: ReaderFontFamily) {
  switch (font) {
    case "modern":
      return 'Didot, "Bodoni 72", "Times New Roman", serif';
    case "sans-serif":
      return 'Avenir Next, Helvetica Neue, sans-serif';
    case "humanist":
      return 'Optima, Candara, "Trebuchet MS", sans-serif';
    case "monospace":
      return 'SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    case "publisher":
      return "inherit";
    case "old-style":
    default:
      return 'Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif';
  }
}
