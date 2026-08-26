"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { BrowserGrantCenter } from "@/components/browser-window/browser-grant-center";
import { NotesLocaleSettings } from "@/components/settings/notes-locale-settings";
import { NotesShortcutSettings } from "@/components/settings/notes-shortcut-settings";
import { NotesVaultSettings } from "@/components/settings/notes-vault-settings";
import { AppUpdatePanel } from "@/components/updates/app-update-panel";
import { UPDATE_SETTINGS_NAVIGATION_EVENT } from "@/features/updates/update-navigation";
import { useAppUpdateStore } from "@/features/updates/update-store";
import type {
  DesktopMcpClient,
  DesktopBrowserSecuritySnapshot,
} from "@/platform/desktop/desktop-bridge";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import {
  DEFAULT_APP_THEME,
  isAppThemeId,
  loadAppTheme,
  saveAppTheme,
} from "@/features/appearance/app-theme";
import {
  loadAppWindowPreferences,
  saveAppWindowPreferences,
} from "@/features/appearance/app-window-preferences";
import {
  cjkSettingsFromUi,
  cjkUiSelectsFromSettings,
  cjkUiTogglesFromSettings,
  loadCjkFormattingSettings,
  saveCjkFormattingSettings,
} from "@/features/notes/formatting/cjk-formatting-store";
import {
  loadNotesTypography,
  saveNotesTypography,
  typographyFromUi,
  typographyUiSelects,
} from "@/features/notes/formatting/notes-typography";
import {
  editorBehaviorFromUi,
  editorBehaviorUiSelects,
  editorBehaviorUiToggles,
  loadNotesEditorBehavior,
  saveNotesEditorBehavior,
} from "@/features/notes/formatting/notes-editor-behavior";
import {
  loadNotesMarkdownLayout,
  markdownLayoutFromUi,
  markdownLayoutUiSelects,
  saveNotesMarkdownLayout,
} from "@/features/notes/formatting/notes-markdown-layout";

/* ------------------------------------------------------------------ */
/* Accent system                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_ACCENT = "#C7A86A";

function normalizeHex(hex: string): string {
  const normalized = (hex || DEFAULT_ACCENT).replace("#", "");
  return normalized.length === 3
    ? normalized
        .split("")
        .map((char) => char + char)
        .join("")
    : normalized;
}

function hexToRgba(hex: string, alpha: number): string {
  const value = parseInt(normalizeHex(hex), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function readableInkForAccent(hex: string): string {
  const value = parseInt(normalizeHex(hex), 16);
  const toLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const red = toLinear((value >> 16) & 255);
  const green = toLinear((value >> 8) & 255);
  const blue = toLinear(value & 255);
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / (0.006 + 0.05);
  return whiteContrast >= darkContrast ? "#fffaf2" : "#17130a";
}

/* ------------------------------------------------------------------ */
/* Inline icon set (the project ships no icon library)                 */
/* ------------------------------------------------------------------ */

type IconName =
  | "search"
  | "palette"
  | "type"
  | "folder"
  | "copy"
  | "plug"
  | "languages"
  | "file-text"
  | "keyboard"
  | "square-terminal"
  | "info"
  | "chevrons-up-down"
  | "check"
  | "refresh-cw"
  | "users"
  | "external-link"
  | "globe"
  | "github";

const ICON_PATHS: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  palette: (
    <>
      <circle cx="13.5" cy="6.5" r="1" />
      <circle cx="17.5" cy="10.5" r="1" />
      <circle cx="8.5" cy="7.5" r="1" />
      <circle cx="6.5" cy="12.5" r="1" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.66h2c3.05 0 5.55-2.5 5.55-5.56C22 6 17.46 2 12 2Z" />
    </>
  ),
  type: (
    <>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </>
  ),
  folder: (
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  ),
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  plug: (
    <>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </>
  ),
  languages: (
    <>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </>
  ),
  "file-text": (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  keyboard: (
    <>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 17h8" />
    </>
  ),
  "square-terminal": (
    <>
      <path d="m7 11 2-2-2-2" />
      <path d="M11 13h4" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </>
  ),
  "chevrons-up-down": (
    <>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  "refresh-cw": (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  "external-link": (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </>
  ),
  github: (
    <>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </>
  ),
};

function Icon({
  name,
  size = 16,
  color = "currentColor",
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flex: "0 0 auto", ...style }}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* State types + initial values (copied verbatim from the design)      */
/* ------------------------------------------------------------------ */

type Toggles = Record<string, boolean>;
type Selects = Record<string, number>;
type Radios = Record<string, string>;
type Installers = Record<string, boolean>;
type Texts = Record<string, string>;

// 笔记阅读主题默认值（与 notes 工作台共享，存 localStorage）。
const INITIAL_THEME: string = DEFAULT_APP_THEME;

const INITIAL_TOGGLES: Toggles = {
  titlebarName: false,
  hideStatus: false,
  openNewTab: false,
  autoPair: true,
  includeCurly: true,
  alsoPairStraight: false,
  copyOnSelectEditor: false,
  keepConsecutiveNewlines: false,
  showBr: false,
  showInvisibles: false,
  showHidden: false,
  showAllFiles: false,
  confirmQuit: true,
  autoSave: true,
  copyToAssets: true,
  cleanUnusedImages: false,
  mcpEnabled: true,
  mcpStartOnLaunch: true,
  mcpAutoApprove: false,
  browserAutomationEnabled: false,
  desktopIslandEnabled: true,
  desktopIslandExpandOnHover: true,
  desktopIslandPrivacyMode: false,
  removeSlashSpacing: true,
  collapseSpaces: true,
  convertDashes: true,
  fixEmDashSpacing: true,
  convertStraightQuotes: true,
  contextAwareQuotes: true,
  fixDoubleQuoteSpacing: true,
  fixSingleQuoteSpacing: true,
  cjkCornerQuotes: false,
  nestedCornerQuotes: false,
  removeTrailingSpaces: true,
  normalizeEllipsis: true,
  collapseNewlines: true,
  skipReferenceSections: false,
  enableRegexSearch: true,
  tableFitWidth: false,
  enableMarkdownLint: true,
  cursorBlink: true,
  copyOnSelectTerm: false,
  webgl: true,
  optionAsMeta: true,
  shellIntegration: true,
  screenReaderMode: false,
};

const INITIAL_SELECTS: Selects = {
  focusDim: 0,
  latinFont: 0,
  cjkFont: 0,
  monoFont: 0,
  // 以下排版默认值须与 notes-typography.ts 的 DEFAULT_NOTES_TYPOGRAPHY 对应。
  fontSize: 0, // 18px
  lineHeightEd: 1, // 1.6
  blockSpacing: 1, // 1×（14px）
  cjkLetterSpacing: 0, // 关闭
  editorWidth: 3, // 100%（不限宽）
  tabSize: 0,
  cjkBrackets: 0,
  copyFormat: 0,
  lineEnding: 0,
  hardBreakStyle: 0,
  saveInterval: 1,
  pasteResize: 0,
  quoteStyle: 0,
  quoteToggleBehavior: 0,
  limitConsecutivePunct: 0,
  smartPasteMarkdown: 0,
  clipboardPasteHandling: 0,
  blockFontSize: 1,
  headingAlign: 0,
  imageBorder: 0,
  imageTableAlign: 1,
  rawHtmlRender: 0,
  termShell: 0,
  panelPosition: 0,
  panelSize: 2,
  termFontSize: 1,
  termLineHeight: 1,
  cursorStyle: 0,
  scrollback: 1,
  terminalBell: 1,
  minContrast: 1,
};

const INITIAL_RADIOS: Radios = { ai: "claude" };

const INITIAL_INSTALLERS: Installers = {
  claudeDesktop: false,
  claudeCode: true,
  codexCli: true,
  geminiCli: false,
};

const INITIAL_TEXTS: Texts = {
  vscodePath: "/Applications/Visual Studio Code.app",
};

/** 仅导入导出已接通持久化与运行时消费者的偏好。 */
const SETTINGS_EXPORT_TOGGLE_KEYS = [
  "titlebarName",
  "hideStatus",
  "autoPair",
  "showInvisibles",
  "removeSlashSpacing",
  "collapseSpaces",
  "convertDashes",
  "fixEmDashSpacing",
  "convertStraightQuotes",
  "contextAwareQuotes",
  "fixDoubleQuoteSpacing",
  "fixSingleQuoteSpacing",
  "cjkCornerQuotes",
  "nestedCornerQuotes",
  "removeTrailingSpaces",
  "normalizeEllipsis",
  "collapseNewlines",
  "skipReferenceSections",
] as const;

const SETTINGS_EXPORT_SELECT_KEYS = [
  "focusDim",
  "latinFont",
  "cjkFont",
  "monoFont",
  "fontSize",
  "lineHeightEd",
  "blockSpacing",
  "cjkLetterSpacing",
  "editorWidth",
  "tabSize",
  "quoteStyle",
  "quoteToggleBehavior",
  "limitConsecutivePunct",
  "blockFontSize",
  "headingAlign",
  "imageBorder",
] as const;

function pickKnownSettings<T extends Record<string, unknown>>(
  values: Partial<T> | undefined,
  keys: readonly string[],
): Partial<T> {
  if (!values) return {};
  return Object.fromEntries(
    keys
      .filter((key) => Object.prototype.hasOwnProperty.call(values, key))
      .map((key) => [key, values[key]]),
  ) as Partial<T>;
}

/* ------------------------------------------------------------------ */
/* Row descriptors (data only — styling happens at render time)        */
/* ------------------------------------------------------------------ */

type Row =
  | { kind: "swatch" }
  | {
      kind: "toggle";
      key: string;
      label: string;
      desc?: string;
      statusText?: string;
      statusColor?: string;
      disabled?: boolean;
    }
  | {
      kind: "select";
      key: string;
      label: string;
      desc?: string;
      options: string[];
      disabled?: boolean;
    }
  | { kind: "key"; label: string; combo: string[]; desc?: string }
  | { kind: "text"; key: string; label?: string; desc?: string; withBrowse?: boolean }
  | {
      kind: "button";
      label?: string;
      desc?: string;
      btnText: string;
      variant?: "default" | "primary" | "danger";
      align?: "left" | "right";
      icon?: IconName;
      statusText?: string;
      statusColor?: string;
      action?: ButtonAction;
    }
  | {
      kind: "info";
      label: string;
      value: string;
      mono?: boolean;
      copy?: boolean;
      linkIcon?: boolean;
      pill?: boolean;
      leftIcon?: IconName;
      valueColor?: string;
    }
  | {
      kind: "radio";
      group: string;
      id: string;
      name: string;
      status?: string;
      statusColor?: string;
      disabled?: boolean;
    }
  | { kind: "installer"; key: string; name: string; filename: string }
  | { kind: "note"; text: string }
  | { kind: "subhead"; text: string }
  | { kind: "shortcutBar" }
  | { kind: "shortcutEditor" }
  | { kind: "notesLocale" }
  | { kind: "notesVaults" }
  | { kind: "appUpdates" }
  | { kind: "browserGrants" };

type ButtonAction =
  | "resetAll"
  | "detectPandoc"
  | "detectCli"
  | "testConnection";

type Section = { title?: string; rows: Row[] };

type AboutLink = { icon: IconName; label: string; href: string };

type Panel = {
  title: string;
  aboutHeader?: boolean;
  aboutLinks?: AboutLink[];
  sections: Section[];
};

type Category = { id: string; label: string; icon: IconName };

const CATEGORIES: Category[] = [
  { id: "appearance", label: "外观", icon: "palette" },
  { id: "editor", label: "编辑器", icon: "type" },
  { id: "files", label: "文件与图片", icon: "folder" },
  { id: "formats", label: "Formats", icon: "copy" },
  { id: "integrations", label: "集成", icon: "plug" },
  { id: "language", label: "语言", icon: "languages" },
  { id: "markdown", label: "Markdown", icon: "file-text" },
  { id: "notes", label: "Notes", icon: "folder" },
  { id: "shortcuts", label: "快捷键", icon: "keyboard" },
  { id: "terminal", label: "终端", icon: "square-terminal" },
  { id: "about", label: "关于", icon: "info" },
];

/* ------------------------------------------------------------------ */
/* Swatch palette                                                      */
/* ------------------------------------------------------------------ */

const SWATCHES = [
  { id: "white", name: "白色", color: "#F4F2EC" },
  { id: "paper", name: "纸张", color: "#E7E0CE" },
  { id: "mint", name: "薄荷", color: "#BBD8C2" },
  { id: "sepia", name: "棕褐色", color: "#E6D6A8" },
  { id: "night", name: "夜间", color: "#1C1C1F" },
  { id: "solarized", name: "Solarized", color: "#0B2B30" },
];

/* ------------------------------------------------------------------ */
/* MCP runtime info                                                    */
/* ------------------------------------------------------------------ */

type McpInfo = {
  port: number | null;
  enabled: boolean;
  connectedClients: number;
  testStatus: string | null;
  testColor: string;
};

const MCP_CLIENT_KEYWORDS: Record<string, (client: DesktopMcpClient) => boolean> = {
  claudeDesktop: (c) => /claude/i.test(c.id + c.label) && /desktop/i.test(c.id + c.label),
  claudeCode: (c) => /claude/i.test(c.id + c.label) && /code/i.test(c.id + c.label),
  codexCli: (c) => /codex/i.test(c.id + c.label),
  geminiCli: (c) => /gemini/i.test(c.id + c.label),
};

type CliEntry = { status: string; color: string; disabled: boolean };
type CliStatus = Record<"claude" | "codex" | "gemini", CliEntry>;

const DEFAULT_CLI_STATUS: CliStatus = {
  claude: { status: "可用", color: "#7BB99A", disabled: false },
  codex: { status: "可用", color: "#7BB99A", disabled: false },
  gemini: { status: "未找到", color: "#56524B", disabled: true },
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function AurisSettings({ accent }: { accent?: string }) {
  const [activeCat, setActiveCat] = useState("appearance");
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState(INITIAL_THEME);
  const [toggles, setToggles] = useState<Toggles>(INITIAL_TOGGLES);
  const [selects, setSelects] = useState<Selects>(INITIAL_SELECTS);
  const [radios, setRadios] = useState<Radios>(INITIAL_RADIOS);
  const [installers, setInstallers] = useState<Installers>(INITIAL_INSTALLERS);
  const [texts, setTexts] = useState<Texts>(INITIAL_TEXTS);

  const [mcp, setMcp] = useState<McpInfo>({
    port: 49190,
    enabled: true,
    connectedClients: 5,
    testStatus: null,
    testColor: "#65615A",
  });
  const [pandocStatus, setPandocStatus] = useState({ text: "未找到", color: "#65615A" });
  const [cliBusy, setCliBusy] = useState(false);
  const [cliStatus, setCliStatus] = useState<CliStatus>(DEFAULT_CLI_STATUS);

  const importInputRef = useRef<HTMLInputElement>(null);
  const browseInputRef = useRef<HTMLInputElement>(null);
  const realClientsRef = useRef<DesktopMcpClient[]>([]);

  const bridge = useMemo(() => getDesktopBridge()?.notesMcp ?? null, []);
  const desktopIslandBridge = useMemo(() => getDesktopBridge()?.desktopIsland ?? null, []);
  const systemBridge = useMemo(() => getDesktopBridge()?.system ?? null, []);
  const browserSecurityBridge = useMemo(() => {
    const desktop = typeof window !== "undefined" ? window.shadowingDesktop : null;
    const api = desktop?.browserSecurity;
    if (
      !api
      || typeof api.getSnapshot !== "function"
      || typeof api.setAutomationEnabled !== "function"
      || typeof api.subscribe !== "function"
    ) {
      return null;
    }
    return api;
  }, []);
  const [browserSecurity, setBrowserSecurity] = useState<DesktopBrowserSecuritySnapshot>({
    available: false,
    automationEnabled: false,
    automationToggleAvailable: false,
    cookieReplay: false,
    eval: { description: "", enabled: false, scope: "" },
    localFixture: false,
    localStorageReplay: false,
    namedProfiles: false,
    production: false,
    securityReason: "browser-security-unavailable",
    securityVerified: false,
  });

  // 右上角更新按钮通过 query 深链到「关于 → 更新」。在 effect
  // 中读取可避免 SSR/CSR 初始树不一致。
  useEffect(() => {
    const selectRequestedSection = (requestedSection: string | null) => {
      if (requestedSection && CATEGORIES.some((category) => category.id === requestedSection)) {
        setActiveCat(requestedSection);
      }
    };
    const syncFromLocation = () => {
      selectRequestedSection(new URLSearchParams(window.location.search).get("section"));
    };
    const handleNavigationRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: string }>).detail;
      selectRequestedSection(detail?.section ?? null);
    };

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener(UPDATE_SETTINGS_NAVIGATION_EVENT, handleNavigationRequest);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener(UPDATE_SETTINGS_NAVIGATION_EVENT, handleNavigationRequest);
    };
  }, []);

  /* --- accent css vars ---
     默认不写内联强调色，让外层 data-app-theme 的高对比令牌生效；只有调用方
     明确传入自定义 accent 时才覆盖。 */
  const accentVars = useMemo(
    () =>
      (accent
        ? {
            "--accent": accent,
            "--accent-ink": readableInkForAccent(accent),
            "--accent-28": hexToRgba(accent, 0.28),
            "--accent-10": hexToRgba(accent, 0.1),
          }
        : {}) as CSSProperties,
    [accent],
  );
  const resolvedAccent = accent ?? "var(--accent)";

  /* --- load real MCP state on desktop --- */
  const syncFromClients = useCallback((clients: DesktopMcpClient[]) => {
    realClientsRef.current = clients;
    setInstallers((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(MCP_CLIENT_KEYWORDS)) {
        const match = clients.find(MCP_CLIENT_KEYWORDS[key]);
        if (match) {
          next[key] = match.status === "connected";
        }
      }
      return next;
    });
    setMcp((prev) => ({
      ...prev,
      connectedClients: clients.filter((c) => c.status === "connected").length,
    }));
  }, []);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge
      .getServerInfo()
      .then((info) => {
        if (cancelled) return;
        setMcp((prev) => ({ ...prev, port: info.port, enabled: info.enabled }));
        setToggles((prev) => ({
          ...prev,
          mcpEnabled: info.policy.enabled,
          mcpStartOnLaunch: info.policy.startOnLaunch,
          mcpAutoApprove: info.policy.autoApproveEdits,
        }));
      })
      .catch(() => undefined);
    void bridge
      .listClients()
      .then((clients) => {
        if (!cancelled) syncFromClients(clients);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bridge, syncFromClients]);

  useEffect(() => {
    if (!browserSecurityBridge) return;
    let cancelled = false;
    const applySnapshot = (snapshot: DesktopBrowserSecuritySnapshot) => {
      if (cancelled) return;
      setBrowserSecurity(snapshot);
      setToggles((prev) => ({
        ...prev,
        browserAutomationEnabled: snapshot.automationEnabled === true,
      }));
    };
    void browserSecurityBridge.getSnapshot().then(applySnapshot).catch(() => undefined);
    const unsubscribe = browserSecurityBridge.subscribe(applySnapshot);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [browserSecurityBridge]);

  useEffect(() => {
    if (!desktopIslandBridge) return;
    let cancelled = false;
    void desktopIslandBridge.getSettings().then((settings) => {
      if (cancelled) return;
      setToggles((prev) => ({
        ...prev,
        desktopIslandEnabled: settings.enabled,
        desktopIslandExpandOnHover: settings.expandOnHover,
        desktopIslandPrivacyMode: settings.privacyMode,
      }));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [desktopIslandBridge]);

  /* --- load persisted notes reading theme on mount --- */
  useEffect(() => {
    setTheme(loadAppTheme());
  }, []);

  /* --- Window + focus presentation: persist and broadcast to live consumers. --- */
  const windowPreferencesSaveInitRef = useRef(true);
  const lastWindowPreferencesJsonRef = useRef("");
  useEffect(() => {
    const persisted = loadAppWindowPreferences();
    lastWindowPreferencesJsonRef.current = JSON.stringify(persisted);
    setToggles((prev) => ({
      ...prev,
      hideStatus: persisted.hideStatus,
      titlebarName: persisted.titlebarName,
    }));
    setSelects((prev) => ({ ...prev, focusDim: persisted.focusDim }));
  }, []);
  useEffect(() => {
    if (windowPreferencesSaveInitRef.current) {
      windowPreferencesSaveInitRef.current = false;
      return;
    }
    const next = {
      focusDim: selects.focusDim === 1 || selects.focusDim === 2 ? selects.focusDim : 0,
      hideStatus: Boolean(toggles.hideStatus),
      titlebarName: Boolean(toggles.titlebarName),
    } as const;
    const json = JSON.stringify(next);
    if (json === lastWindowPreferencesJsonRef.current) return;
    lastWindowPreferencesJsonRef.current = json;
    saveAppWindowPreferences(next);
  }, [selects.focusDim, toggles.hideStatus, toggles.titlebarName]);

  /* --- CJK 排版设置：加载时回填「语言」分类开关，改动时持久化 --- */
  const cjkSaveInitRef = useRef(true);
  const lastCjkJsonRef = useRef("");
  useEffect(() => {
    const persisted = loadCjkFormattingSettings();
    lastCjkJsonRef.current = JSON.stringify(persisted);
    setToggles((prev) => ({ ...prev, ...cjkUiTogglesFromSettings(persisted) }));
    setSelects((prev) => ({ ...prev, ...cjkUiSelectsFromSettings(persisted) }));
  }, []);
  useEffect(() => {
    // 跳过首个（INITIAL state）回合，避免在加载完成前用默认值覆盖已存偏好。
    if (cjkSaveInitRef.current) {
      cjkSaveInitRef.current = false;
      return;
    }
    const next = cjkSettingsFromUi(toggles, selects);
    const json = JSON.stringify(next);
    if (json === lastCjkJsonRef.current) {
      return;
    }
    lastCjkJsonRef.current = json;
    saveCjkFormattingSettings(next);
  }, [toggles, selects]);

  /* --- 编辑器排版：加载时回填下拉，改动时持久化（同 CJK 的跳过首回合策略）--- */
  const typoSaveInitRef = useRef(true);
  const lastTypoJsonRef = useRef("");
  useEffect(() => {
    const persisted = loadNotesTypography();
    lastTypoJsonRef.current = JSON.stringify(persisted);
    setSelects((prev) => ({ ...prev, ...typographyUiSelects(persisted) }));
  }, []);
  useEffect(() => {
    if (typoSaveInitRef.current) {
      typoSaveInitRef.current = false;
      return;
    }
    const next = typographyFromUi(selects);
    const json = JSON.stringify(next);
    if (json === lastTypoJsonRef.current) {
      return;
    }
    lastTypoJsonRef.current = json;
    saveNotesTypography(next);
  }, [selects]);

  /* --- 源码编辑器行为（自动配对 / Tab 宽度）：加载回填，改动持久化 --- */
  const behaviorSaveInitRef = useRef(true);
  const lastBehaviorJsonRef = useRef("");
  useEffect(() => {
    const persisted = loadNotesEditorBehavior();
    lastBehaviorJsonRef.current = JSON.stringify(persisted);
    setToggles((prev) => ({ ...prev, ...editorBehaviorUiToggles(persisted) }));
    setSelects((prev) => ({ ...prev, ...editorBehaviorUiSelects(persisted) }));
  }, []);
  useEffect(() => {
    if (behaviorSaveInitRef.current) {
      behaviorSaveInitRef.current = false;
      return;
    }
    const next = editorBehaviorFromUi(toggles, selects);
    const json = JSON.stringify(next);
    if (json === lastBehaviorJsonRef.current) {
      return;
    }
    lastBehaviorJsonRef.current = json;
    saveNotesEditorBehavior(next);
  }, [toggles, selects]);

  /* --- Markdown 渲染布局：加载回填下拉，改动持久化 --- */
  const mdLayoutSaveInitRef = useRef(true);
  const lastMdLayoutJsonRef = useRef("");
  useEffect(() => {
    const persisted = loadNotesMarkdownLayout();
    lastMdLayoutJsonRef.current = JSON.stringify(persisted);
    setSelects((prev) => ({ ...prev, ...markdownLayoutUiSelects(persisted) }));
  }, []);
  useEffect(() => {
    if (mdLayoutSaveInitRef.current) {
      mdLayoutSaveInitRef.current = false;
      return;
    }
    const next = markdownLayoutFromUi(selects);
    const json = JSON.stringify(next);
    if (json === lastMdLayoutJsonRef.current) {
      return;
    }
    lastMdLayoutJsonRef.current = json;
    saveNotesMarkdownLayout(next);
  }, [selects]);

  /* --- selecting a swatch persists + broadcasts to the notes workbench --- */
  const handleSetTheme = useCallback((id: string) => {
    setTheme(id);
    if (isAppThemeId(id)) {
      saveAppTheme(id);
    }
  }, []);

  /* --- handlers --- */
  const toggleKey = useCallback(
    (key: string) => {
      setToggles((prev) => {
        const value = !prev[key];
        if (bridge && (key === "mcpEnabled" || key === "mcpStartOnLaunch" || key === "mcpAutoApprove")) {
          const policyKey =
            key === "mcpEnabled"
              ? "enabled"
              : key === "mcpStartOnLaunch"
                ? "startOnLaunch"
                : "autoApproveEdits";
          void bridge
            .updatePolicy({ [policyKey]: value })
            .then((info) => setMcp((m) => ({ ...m, port: info.port, enabled: info.enabled })))
            .catch(() => undefined);
        }
        if (key === "browserAutomationEnabled") {
          if (!browserSecurityBridge || !browserSecurity.automationToggleAvailable) {
            return prev;
          }
          void browserSecurityBridge
            .setAutomationEnabled(value)
            .then((snapshot) => {
              setBrowserSecurity(snapshot);
              setToggles((current) => ({
                ...current,
                browserAutomationEnabled: snapshot.automationEnabled === true,
              }));
            })
            .catch(() => undefined);
        }
        const islandSettingKey = {
          desktopIslandEnabled: "enabled",
          desktopIslandExpandOnHover: "expandOnHover",
          desktopIslandPrivacyMode: "privacyMode",
        }[key] as "enabled" | "expandOnHover" | "privacyMode" | undefined;
        if (islandSettingKey && desktopIslandBridge) {
          void desktopIslandBridge.updateSettings({ [islandSettingKey]: value }).then((settings) => {
            setToggles((current) => ({
              ...current,
              desktopIslandEnabled: settings.enabled,
              desktopIslandExpandOnHover: settings.expandOnHover,
              desktopIslandPrivacyMode: settings.privacyMode,
            }));
          }).catch(() => undefined);
        }
        return { ...prev, [key]: value };
      });
    },
    [bridge, browserSecurity.automationToggleAvailable, browserSecurityBridge, desktopIslandBridge],
  );

  const cycleSelect = useCallback((key: string, len: number) => {
    setSelects((prev) => ({ ...prev, [key]: ((prev[key] || 0) + 1) % len }));
  }, []);

  const setRadio = useCallback((group: string, id: string) => {
    setRadios((prev) => ({ ...prev, [group]: id }));
  }, []);

  const setText = useCallback((key: string, value: string) => {
    setTexts((prev) => ({ ...prev, [key]: value }));
  }, []);

  const installerAction = useCallback(
    (key: string, install: boolean) => {
      setInstallers((prev) => ({ ...prev, [key]: install }));
      if (!bridge) return;
      const match = realClientsRef.current.find(MCP_CLIENT_KEYWORDS[key]);
      if (!match) return;
      const run = install ? bridge.installClient : bridge.removeClient;
      void run(match.id)
        .then((clients) => syncFromClients(clients))
        .catch(() => undefined);
    },
    [bridge, syncFromClients],
  );

  const resetAll = useCallback(() => {
    if (typeof window !== "undefined" && !window.confirm("确定要将所有设置恢复为默认值吗？此操作无法撤销。")) {
      return;
    }
    handleSetTheme(INITIAL_THEME);
    setToggles(INITIAL_TOGGLES);
    setSelects(INITIAL_SELECTS);
    setRadios(INITIAL_RADIOS);
    setInstallers(INITIAL_INSTALLERS);
    setTexts(INITIAL_TEXTS);
  }, [handleSetTheme]);

  const exportSettings = useCallback(() => {
    if (typeof window === "undefined") return;
    const payload = {
      version: 2,
      theme,
      toggles: pickKnownSettings<Toggles>(toggles, SETTINGS_EXPORT_TOGGLE_KEYS),
      selects: pickKnownSettings<Selects>(selects, SETTINGS_EXPORT_SELECT_KEYS),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "auris-settings.json";
    link.click();
    URL.revokeObjectURL(url);
  }, [theme, toggles, selects]);

  const onImportFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result ?? "")) as Partial<{
            theme: string;
            toggles: Partial<Toggles>;
            selects: Partial<Selects>;
          }>;
          if (data.theme) handleSetTheme(data.theme);
          if (data.toggles) {
            setToggles((prev) => ({
              ...prev,
              ...pickKnownSettings<Toggles>(
                data.toggles,
                SETTINGS_EXPORT_TOGGLE_KEYS,
              ),
            } as Toggles));
          }
          if (data.selects) {
            setSelects((prev) => ({
              ...prev,
              ...pickKnownSettings<Selects>(
                data.selects,
                SETTINGS_EXPORT_SELECT_KEYS,
              ),
            } as Selects));
          }
        } catch {
          if (typeof window !== "undefined") {
            window.alert("无法解析所选文件，请选择有效的设置 JSON。");
          }
        }
      };
      reader.readAsText(file);
    },
    [handleSetTheme],
  );

  const onBrowseFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setText("vscodePath", file.name);
    },
    [setText],
  );

  const browse = useCallback(() => {
    if (systemBridge?.pickFile) {
      void systemBridge
        .pickFile({ title: "选择外部编辑器应用" })
        .then((picked) => {
          if (picked) setText("vscodePath", picked);
        })
        .catch(() => undefined);
      return;
    }
    browseInputRef.current?.click();
  }, [systemBridge, setText]);

  const testConnection = useCallback(() => {
    setMcp((prev) => ({ ...prev, testStatus: "检测中…", testColor: "#65615A" }));
    if (!bridge) {
      setMcp((prev) => ({ ...prev, testStatus: "仅桌面端可用", testColor: "#D98A7E" }));
      return;
    }
    void bridge
      .getServerInfo()
      .then((info) => {
        setMcp((prev) => ({
          ...prev,
          port: info.port,
          enabled: info.enabled,
          testStatus: info.enabled && info.port ? `已连接 · localhost:${info.port}` : "未连接",
          testColor: info.enabled && info.port ? "#7BB99A" : "#D98A7E",
        }));
      })
      .catch(() => setMcp((prev) => ({ ...prev, testStatus: "连接失败", testColor: "#D98A7E" })));
  }, [bridge]);

  const detectPandoc = useCallback(() => {
    setPandocStatus({ text: "检测中…", color: "#65615A" });
    if (!systemBridge?.detectBinary) {
      setPandocStatus({ text: "仅桌面端可用", color: "#65615A" });
      return;
    }
    void systemBridge
      .detectBinary("pandoc")
      .then((result) => {
        setPandocStatus(
          result.installed
            ? { text: result.version ? `已安装 · ${result.version}` : "已安装", color: "#7BB99A" }
            : { text: "未找到", color: "#65615A" },
        );
      })
      .catch(() => setPandocStatus({ text: "检测失败", color: "#D98A7E" }));
  }, [systemBridge]);

  const detectCli = useCallback(() => {
    setCliBusy(true);
    if (!systemBridge?.detectBinary) {
      window.setTimeout(() => setCliBusy(false), 400);
      return;
    }
    const detect = systemBridge.detectBinary;
    const ids: Array<keyof CliStatus> = ["claude", "codex", "gemini"];
    void Promise.all(ids.map((id) => detect(id).catch(() => ({ installed: false, version: null, path: null }))))
      .then((results) => {
        setCliStatus((prev) => {
          const next = { ...prev };
          ids.forEach((id, index) => {
            const found = results[index].installed;
            next[id] = found
              ? { status: "可用", color: "#7BB99A", disabled: false }
              : { status: "未找到", color: "#56524B", disabled: true };
          });
          return next;
        });
        // Also refresh MCP client install state while we are at it.
        if (bridge) {
          void bridge
            .listClients()
            .then((clients) => syncFromClients(clients))
            .catch(() => undefined);
        }
      })
      .finally(() => setCliBusy(false));
  }, [systemBridge, bridge, syncFromClients]);

  const runAction = useCallback(
    (action: ButtonAction) => {
      switch (action) {
        case "resetAll":
          resetAll();
          break;
        case "detectPandoc":
          detectPandoc();
          break;
        case "detectCli":
          detectCli();
          break;
        case "testConnection":
          testConnection();
          break;
      }
    },
    [resetAll, detectPandoc, detectCli, testConnection],
  );

  /* --- panel data --- */
  const panel = useMemo<Panel>(
    () => buildPanel(activeCat, { pandocStatus, mcp, cliBusy, cliStatus, browserSecurity }),
    [activeCat, pandocStatus, mcp, cliBusy, cliStatus, browserSecurity],
  );

  /* --- 关于页版本号 ---
     以前这里硬编码「版本 1.4.0」，与 package.json(1.0.0) 不符。真实版本只有主
     进程知道（app.getVersion），所以从 updater 快照里取；桌面壳不可用时不编一个
     版本号出来，显示「开发模式」。 */
  const currentVersion = useAppUpdateStore((state) => state.currentVersion);
  const aboutVersionLabel = currentVersion ? `版本 ${currentVersion}` : "开发模式";

  /* --- filtered categories --- */
  const query = search.trim().toLowerCase();
  const filteredCats = CATEGORIES.filter((c) => !query || c.label.toLowerCase().includes(query));

  /* --- render --- */
  return (
    <div className="auris-settings" style={{ ...accentVars }}>
      <style>{SETTINGS_CSS}</style>

      <aside className="auris-settings__sidebar">
        <div className="auris-settings__searchwrap">
          <div className="auris-settings__searchbox">
            <Icon name="search" size={15} color="#56524B" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索设置…"
              className="auris-settings__searchinput"
            />
          </div>
        </div>
        <nav className="auris-settings__nav">
          {filteredCats.map((cat) => {
            const active = cat.id === activeCat;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCat(cat.id)}
                className="auris-settings__cat"
                data-active={active ? "true" : "false"}
              >
                <Icon name={cat.icon} size={17} />
                <span className="auris-settings__cat-label">{cat.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="auris-settings__main">
        <div className="auris-settings__page">
          <div className="auris-settings__eyebrow">设置</div>
          <h1 className="auris-settings__title">{panel.title}</h1>
          <div className="auris-settings__divider" />

          {panel.aboutHeader ? (
            <div className="auris-settings__about-header">
              <div className="auris-settings__about-id">
                <div className="auris-settings__about-logo">A</div>
                <div>
                  <div className="auris-settings__about-name">Auris</div>
                  <div className="auris-settings__about-version">
                    {aboutVersionLabel}
                  </div>
                </div>
              </div>
              <div className="auris-settings__about-links">
                {(panel.aboutLinks ?? []).map((link) => (
                  <button
                    key={link.label}
                    type="button"
                    className="auris-settings__about-link"
                    onClick={() => typeof window !== "undefined" && window.open(link.href, "_blank")}
                  >
                    <Icon name={link.icon} size={15} />
                    <span>{link.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {panel.sections.map((section, sectionIndex) => (
            <section key={sectionIndex} className="auris-settings__section">
              {section.title ? (
                <div className="auris-settings__section-title">
                  <span className="auris-settings__section-dot" />
                  <span>{section.title}</span>
                </div>
              ) : null}
              {section.rows.map((row, rowIndex) => (
                <RenderRow
                  key={rowIndex}
                  row={row}
                  accent={resolvedAccent}
                  theme={theme}
                  toggles={toggles}
                  selects={selects}
                  radios={radios}
                  installers={installers}
                  texts={texts}
                  onSetTheme={handleSetTheme}
                  onToggle={toggleKey}
                  onCycle={cycleSelect}
                  onRadio={setRadio}
                  onText={setText}
                  onInstall={(key) => installerAction(key, true)}
                  onRemove={(key) => installerAction(key, false)}
                  onAction={runAction}
                  onExport={exportSettings}
                  onImport={() => importInputRef.current?.click()}
                  onResetShortcuts={resetAll}
                  onBrowse={browse}
                />
              ))}
            </section>
          ))}
        </div>
      </main>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={onImportFile}
      />
      <input ref={browseInputRef} type="file" hidden onChange={onBrowseFile} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row renderer                                                        */
/* ------------------------------------------------------------------ */

type RowHandlers = {
  row: Row;
  accent: string;
  theme: string;
  toggles: Toggles;
  selects: Selects;
  radios: Radios;
  installers: Installers;
  texts: Texts;
  onSetTheme: (id: string) => void;
  onToggle: (key: string) => void;
  onCycle: (key: string, len: number) => void;
  onRadio: (group: string, id: string) => void;
  onText: (key: string, value: string) => void;
  onInstall: (key: string) => void;
  onRemove: (key: string) => void;
  onAction: (action: ButtonAction) => void;
  onExport: () => void;
  onImport: () => void;
  onResetShortcuts: () => void;
  onBrowse: () => void;
};

function RenderRow(props: RowHandlers) {
  const { row, accent } = props;

  switch (row.kind) {
    case "swatch":
      return (
        <div className="auris-settings__swatches">
          {SWATCHES.map((sw) => {
            const selected = props.theme === sw.id;
            return (
              <div key={sw.id} className="auris-settings__swatch" onClick={() => props.onSetTheme(sw.id)}>
                <div
                  className="auris-settings__swatch-ring"
                  style={{ border: `2px solid ${selected ? accent : "transparent"}` }}
                >
                  <div className="auris-settings__swatch-dot" style={{ background: sw.color }} />
                </div>
                <span
                  className="auris-settings__swatch-name"
                  style={{ color: selected ? accent : "var(--app-muted)", fontWeight: selected ? 600 : 500 }}
                >
                  {sw.name}
                </span>
              </div>
            );
          })}
        </div>
      );

    case "toggle": {
      const on = !!props.toggles[row.key];
      const disabled = !!row.disabled;
      const statusColor = row.statusColor || "#65615A";
      return (
        <div className="auris-settings__row auris-settings__row--split">
          <div className="auris-settings__row-text">
            <div className="auris-settings__row-label">{row.label}</div>
            {row.desc ? <div className="auris-settings__row-desc">{row.desc}</div> : null}
          </div>
          <div className="auris-settings__row-control">
            {row.statusText ? (
              <span className="auris-settings__status" style={{ color: statusColor }}>
                <span className="auris-settings__status-dot" style={{ background: statusColor }} />
                {row.statusText}
              </span>
            ) : null}
            <div
              aria-checked={on}
              aria-disabled={disabled}
              aria-label={row.label}
              className="auris-settings__track"
              data-disabled={disabled ? "true" : "false"}
              data-testid={row.key === "browserAutomationEnabled" ? "browser-automation-toggle" : undefined}
              onKeyDown={(event) => {
                if (!disabled && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  props.onToggle(row.key);
                }
              }}
              onClick={disabled ? undefined : () => props.onToggle(row.key)}
              role="switch"
              tabIndex={disabled ? -1 : 0}
              style={{
                border: `1px solid ${on ? accent : "var(--app-line)"}`,
                background: on ? accent : "var(--app-fill-strong)",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.45 : 1,
              }}
            >
              <div
                className="auris-settings__knob"
                style={{
                  background: on ? "#1A1408" : "#9A958C",
                  transform: `translateX(${on ? "19px" : "0"})`,
                }}
              />
            </div>
          </div>
        </div>
      );
    }

    case "select": {
      const idx = props.selects[row.key] || 0;
      const disabled = !!row.disabled;
      return (
        <div className="auris-settings__row auris-settings__row--split">
          <div className="auris-settings__row-text">
            <div className="auris-settings__row-label">{row.label}</div>
            {row.desc ? <div className="auris-settings__row-desc">{row.desc}</div> : null}
          </div>
          <button
            aria-label={`${row.label}：${row.options[idx]}`}
            type="button"
            className="auris-settings__select"
            data-disabled={disabled ? "true" : "false"}
            onClick={disabled ? undefined : () => props.onCycle(row.key, row.options.length)}
          >
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.options[idx]}</span>
            <Icon name="chevrons-up-down" size={14} color="#6E6A62" />
          </button>
        </div>
      );
    }

    case "key":
      return (
        <div className="auris-settings__row auris-settings__row--split auris-settings__row--key">
          <div className="auris-settings__row-text">
            <div className="auris-settings__key-label">{row.label}</div>
            {row.desc ? <div className="auris-settings__key-desc">{row.desc}</div> : null}
          </div>
          <div className="auris-settings__keys">
            {row.combo.map((cap, i) => (
              <span key={i} className="auris-settings__cap">
                {cap}
              </span>
            ))}
          </div>
        </div>
      );

    case "text":
      return (
        <div className="auris-settings__row">
          {row.label ? <div className="auris-settings__row-label auris-settings__text-label">{row.label}</div> : null}
          <div className="auris-settings__text-controls">
            <input
              value={props.texts[row.key] || ""}
              onChange={(event) => props.onText(row.key, event.target.value)}
              className="auris-settings__text-input"
            />
            {row.withBrowse ? (
              <button type="button" className="auris-settings__browse" onClick={props.onBrowse}>
                Browse…
              </button>
            ) : null}
          </div>
        </div>
      );

    case "button": {
      const variant = row.variant || "default";
      const align = row.align || "right";
      const btn = (
        <button
          type="button"
          className="auris-settings__btn"
          data-variant={variant}
          style={variant === "primary" ? { background: accent } : undefined}
          onClick={row.action ? () => props.onAction(row.action as ButtonAction) : undefined}
        >
          {row.icon ? <Icon name={row.icon} size={14} /> : null}
          <span>{row.btnText}</span>
        </button>
      );
      if (align === "left") {
        return <div className="auris-settings__row">{btn}</div>;
      }
      return (
        <div className="auris-settings__row auris-settings__row--split">
          <div className="auris-settings__row-text">
            {row.label ? <div className="auris-settings__row-label">{row.label}</div> : null}
            {row.desc ? <div className="auris-settings__row-desc">{row.desc}</div> : null}
          </div>
          <div className="auris-settings__row-control">
            {row.statusText ? (
              <span style={{ fontSize: 13, color: row.statusColor || "#65615A" }}>{row.statusText}</span>
            ) : null}
            {btn}
          </div>
        </div>
      );
    }

    case "info":
      return (
        <div className="auris-settings__row auris-settings__row--split auris-settings__row--info">
          <div className="auris-settings__info-left">
            {row.leftIcon ? <Icon name={row.leftIcon} size={14} color="#65615A" /> : null}
            <span className="auris-settings__info-label">{row.label}</span>
          </div>
          <div className="auris-settings__info-right">
            <span
              className="auris-settings__info-value"
              style={{
                fontFamily: row.mono ? "ui-monospace,'SF Mono',Menlo,monospace" : undefined,
                color: row.valueColor || "#9A958C",
                ...(row.pill
                  ? {
                      padding: "3px 9px",
                      borderRadius: 7,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.03)",
                    }
                  : {}),
              }}
            >
              {row.value}
            </span>
            {row.copy ? <Icon name="copy" size={13} color="#56524B" style={{ cursor: "pointer" }} /> : null}
            {row.linkIcon ? (
              <Icon name="external-link" size={13} color={accent} style={{ cursor: "pointer" }} />
            ) : null}
          </div>
        </div>
      );

    case "radio": {
      const selected = props.radios[row.group] === row.id;
      const disabled = !!row.disabled;
      return (
        <div
          className="auris-settings__row auris-settings__row--split auris-settings__row--radio"
          onClick={disabled ? undefined : () => props.onRadio(row.group, row.id)}
          style={{ cursor: disabled ? "default" : "pointer" }}
        >
          <div className="auris-settings__radio-left">
            <div
              className="auris-settings__radio-circle"
              style={{
                border: `1.5px solid ${disabled ? "rgba(255,255,255,0.12)" : selected ? accent : "rgba(255,255,255,0.22)"}`,
              }}
            >
              <div
                className="auris-settings__radio-dot"
                style={selected ? { width: 10, height: 10, background: accent } : { width: 0, height: 0 }}
              />
            </div>
            <span style={{ fontSize: 15, color: disabled ? "#56524B" : "#ECE8DF" }}>{row.name}</span>
          </div>
          {row.status ? (
            <span style={{ fontSize: 13, color: row.statusColor || "#65615A", flex: "0 0 auto" }}>{row.status}</span>
          ) : null}
        </div>
      );
    }

    case "installer": {
      const installed = !!props.installers[row.key];
      return (
        <div className="auris-settings__row auris-settings__row--split auris-settings__row--info">
          <div className="auris-settings__installer-left">
            {installed ? (
              <Icon name="check" size={18} color="#7BB99A" />
            ) : (
              <span className="auris-settings__installer-circle" />
            )}
            <div>
              <div className="auris-settings__installer-name">{row.name}</div>
              <div className="auris-settings__installer-file">
                <span>{row.filename}</span>
                <Icon name="copy" size={12} color="#4F4B44" style={{ cursor: "pointer" }} />
              </div>
            </div>
          </div>
          <div className="auris-settings__installer-actions">
            {installed ? (
              <>
                <button type="button" className="auris-settings__btn-sm">
                  更新
                </button>
                <button
                  type="button"
                  className="auris-settings__btn-sm auris-settings__btn-sm--danger"
                  onClick={() => props.onRemove(row.key)}
                >
                  移除
                </button>
              </>
            ) : (
              <button
                type="button"
                className="auris-settings__btn-sm auris-settings__btn-sm--primary"
                style={{ background: accent }}
                onClick={() => props.onInstall(row.key)}
              >
                安装
              </button>
            )}
          </div>
        </div>
      );
    }

    case "subhead":
      return <div className="auris-settings__subhead">{row.text}</div>;

    case "note":
      return <div className="auris-settings__note">{row.text}</div>;

    case "browserGrants":
      return <BrowserGrantCenter />;

    case "shortcutBar":
      return (
        <div className="auris-settings__shortcutbar">
          <div className="auris-settings__shortcutbar-search">
            <Icon name="search" size={14} color="#56524B" />
            <input placeholder="搜索快捷键…" className="auris-settings__searchinput" />
          </div>
          <button type="button" className="auris-settings__btn-sm" onClick={props.onExport}>
            导出
          </button>
          <button type="button" className="auris-settings__btn-sm" onClick={props.onImport}>
            导入
          </button>
          <button
            type="button"
            className="auris-settings__btn-sm auris-settings__btn-sm--danger"
            onClick={props.onResetShortcuts}
          >
            全部重置
          </button>
        </div>
      );

    case "shortcutEditor":
      return <NotesShortcutSettings />;

    case "notesLocale":
      return <NotesLocaleSettings />;

    case "notesVaults":
      return <NotesVaultSettings />;

    case "appUpdates":
      return <AppUpdatePanel />;

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Panel builder                                                       */
/* ------------------------------------------------------------------ */

function buildPanel(
  id: string,
  ctx: {
    pandocStatus: { text: string; color: string };
    mcp: McpInfo;
    cliBusy: boolean;
    cliStatus: CliStatus;
    browserSecurity: DesktopBrowserSecuritySnapshot;
  },
): Panel {
  switch (id) {
    case "appearance":
      return {
        title: "外观",
        sections: [
          { title: "主题", rows: [{ kind: "swatch" }] },
          {
            title: "窗口",
            rows: [
              { kind: "toggle", key: "titlebarName", label: "在标题栏显示文件名", desc: "在窗口标题中显示当前文件名" },
              { kind: "toggle", key: "hideStatus", label: "自动隐藏状态栏", desc: "不与界面交互时隐藏底部状态栏" },
            ],
          },
          {
            title: "桌面灵动岛",
            rows: [
              { kind: "toggle", key: "desktopIslandEnabled", label: "显示桌面灵动岛", desc: "在 macOS 桌面顶部显示今日任务与回顾复习" },
              { kind: "toggle", key: "desktopIslandExpandOnHover", label: "悬停时展开", desc: "指针停留片刻后自动展开，移开后自动收起" },
              { kind: "toggle", key: "desktopIslandPrivacyMode", label: "隐私模式", desc: "展开时隐藏任务和知识点标题，只显示数量与进度" },
            ],
          },
          {
            title: "专注模式",
            rows: [
              {
                kind: "select",
                key: "focusDim",
                label: "暗化程度",
                desc: "专注模式下非聚焦内容的暗化强度",
                options: ["标准", "强", "更强"],
              },
            ],
          },
        ],
      };

    case "editor":
      return {
        title: "编辑器",
        sections: [
          {
            title: "作用范围",
            rows: [{ kind: "note", text: "自动配对、Tab 宽度和不可见字符仅作用于笔记的源码模式；所见即所得编辑器不使用这套配置。" }],
          },
          {
            title: "排版",
            rows: [
              { kind: "select", key: "latinFont", label: "拉丁字体", options: ["系统默认（无衬线）", "Athelas", "Georgia", "Charter", "Times"] },
              { kind: "select", key: "cjkFont", label: "CJK 字体", options: ["系统默认（无衬线）", "Kaiti SC", "Noto Serif SC", "PingFang SC", "Songti SC"] },
              { kind: "select", key: "monoFont", label: "等宽字体", options: ["系统默认", "Menlo", "SF Mono", "JetBrains Mono", "Fira Code"] },
              { kind: "select", key: "fontSize", label: "字体大小", options: ["18px", "20px", "22px", "24px"] },
              { kind: "select", key: "lineHeightEd", label: "行高", options: ["1.4（紧凑）", "1.6（标准）", "1.8（宽松）", "2.0"] },
              { kind: "select", key: "blockSpacing", label: "块间距", options: ["0.5×（紧凑）", "1×（正常）", "1.5×", "2×"] },
              { kind: "select", key: "cjkLetterSpacing", label: "CJK 字母间距", options: ["关闭", "0.05em", "0.1em"] },
            ],
          },
          {
            title: "显示",
            rows: [
              { kind: "select", key: "editorWidth", label: "编辑器宽度", desc: "最大内容宽度", options: ["40em（窄）", "50em（中等）", "60em（宽）", "100%"] },
            ],
          },
          {
            title: "行为",
            rows: [
              { kind: "select", key: "tabSize", label: "制表符大小", desc: "按 Tab 时插入的空格数", options: ["2 个空格", "4 个空格", "Tab"] },
              { kind: "toggle", key: "openNewTab", label: "在新标签页中打开文件", desc: "在新标签页中打开现有文件，而不是复用当前的空标签页" },
              { kind: "toggle", key: "autoPair", label: "启用自动配对", desc: "自动插入结束括号和引号" },
              { kind: "select", key: "cjkBrackets", label: "CJK 括号", desc: "自动配对 CJK 括号如「」【】《》", options: ["自动", "开启", "关闭"] },
              { kind: "toggle", key: "includeCurly", label: "包含弯引号", desc: "自动配对 “” 和 ‘’（可能与 IME 智能引号冲突）" },
              { kind: "toggle", key: "alsoPairStraight", label: '也配对 "', desc: '输入 " 时插入 "" 对（帮助 IME 切换开闭）' },
              { kind: "select", key: "copyFormat", label: "复制格式", desc: "从所见即所得复制时在纯文本中放入什么", options: ["纯文本", "Markdown", "HTML"] },
              { kind: "toggle", key: "copyOnSelectEditor", label: "选中时复制", desc: "自动将选中的文本复制到剪贴板" },
            ],
          },
          {
            title: "空白符",
            rows: [
              { kind: "select", key: "lineEnding", label: "保存时的行结束符", desc: "保留原始行结束符或保存时规范化", options: ["保留现有", "LF", "CRLF"] },
              { kind: "toggle", key: "keepConsecutiveNewlines", label: "保留连续换行符", desc: "按原样保留多个空行（不折叠）" },
              { kind: "select", key: "hardBreakStyle", label: "保存时的硬换行符样式", desc: "两个空格可用于任何地方。反斜杠在 Reddit/Jekyll 上可能失败。", options: ["保留现有", "两个空格", "反斜杠"] },
              { kind: "toggle", key: "showBr", label: "显示 <br> 标签", desc: "在编辑器中可见地显示 HTML 换行标签" },
              { kind: "toggle", key: "showInvisibles", label: "显示不可见字符", desc: "显示空格、制表符、软换行和硬换行。打印时隐藏。" },
            ],
          },
          {
            title: "大文件",
            rows: [
              { kind: "note", text: "已启用：按 UTF-8 实际字节数评估；达到 1 MB 自动切换轻量源码编辑，达到 5 MB 使用纯文本策略并关闭实时预览。" },
            ],
          },
        ],
      };

    case "files":
      return {
        title: "文件与图片",
        sections: [
          {
            title: "文件浏览与资源管理",
            rows: [
              {
                kind: "note",
                text: "当前版本尚未提供隐藏文件过滤、全部文件显示、图片自动归档或未引用资源清理的可配置实现。为避免保存无效偏好，相关开关已从设置中移除。",
              },
            ],
          },
          {
            title: "数据安全",
            rows: [
              {
                kind: "note",
                text: "当前版本不提供“确认退出”或“自动保存策略”的切换。相关能力将在具备完整桌面端持久化与退出确认链路后再开放。",
              },
            ],
          },
        ],
      };

    case "notes":
      return {
        title: "Notes",
        sections: [
          {
            title: "Vault 管理",
            rows: [{ kind: "notesVaults" }],
          },
        ],
      };

    case "formats":
      return {
        title: "Formats",
        sections: [
          {
            title: "导出工具",
            rows: [
              {
                kind: "button",
                label: "Pandoc",
                desc: "检测本机 Pandoc 是否可用；DOCX、EPUB、LaTeX 等导出会在对应能力开放后显示。",
                btnText: "检测",
                statusText: ctx.pandocStatus.text,
                statusColor: ctx.pandocStatus.color,
                action: "detectPandoc",
              },
            ],
          },
          {
            title: "外部编辑器",
            rows: [
              {
                kind: "note",
                text: "“在外部编辑器中打开”命令尚未接入桌面端，因此不再提供不会被读取的应用路径配置。",
              },
            ],
          },
        ],
      };

    case "integrations":
      return {
        title: "集成",
        sections: [
          {
            title: "MCP 服务器",
            rows: [
              { kind: "toggle", key: "mcpEnabled", label: "启用 MCP 服务器", desc: "允许 AI 助手连接本地 Notes / Browser / Workflow 工具", statusText: ctx.mcp.enabled ? "运行中" : "已停止", statusColor: ctx.mcp.enabled ? "#7BB99A" : "#65615A" },
              { kind: "toggle", key: "mcpStartOnLaunch", label: "启动时启动", desc: "Auris 打开时自动启动" },
              { kind: "toggle", key: "mcpAutoApprove", label: "自动批准编辑", desc: "应用 AI 更改而无需预览（谨慎使用）" },
              { kind: "info", label: "监听于", value: ctx.mcp.port ? `localhost:${ctx.mcp.port}` : "—", mono: true, copy: true, pill: true },
              { kind: "note", text: "端口自动分配。AI 客户端自动发现。" },
              {
                kind: "info",
                label: "可用工具",
                value: "auris_session · auris_workspace · auris_document · auris_selection · auris_browser · auris_workflow",
              },
              { kind: "info", label: "连接的客户端", value: String(ctx.mcp.connectedClients), leftIcon: "users", valueColor: "#7BB99A" },
              { kind: "button", btnText: ctx.mcp.testStatus ?? "测试连接", variant: "default", align: "left", icon: "refresh-cw", action: "testConnection" },
            ],
          },
          {
            title: "浏览器自动化",
            rows: [
              ...(ctx.browserSecurity.automationToggleAvailable
                ? [
                  {
                    kind: "toggle" as const,
                    key: "browserAutomationEnabled",
                    label: "启用 MCP 浏览器自动化",
                    desc: ctx.browserSecurity.eval.description
                      || "仅在安全门通过后允许 AI 控制浏览器。命名配置与 cookie 回放仍单独关闭。",
                    statusText: ctx.browserSecurity.automationEnabled ? "已启用" : "已关闭",
                    statusColor: ctx.browserSecurity.automationEnabled ? "#7BB99A" : "#65615A",
                  },
                  {
                    kind: "note" as const,
                    text: [
                      `Eval 范围：${ctx.browserSecurity.eval.scope || "unavailable"}。`,
                      `命名配置：${ctx.browserSecurity.namedProfiles ? "开" : "关"}；`,
                      `cookie 回放：${ctx.browserSecurity.cookieReplay ? "开" : "关"}；`,
                      `localStorage 回放：${ctx.browserSecurity.localStorageReplay ? "开" : "关"}。`,
                      "回放关闭是当前生产能力的刻意策略。",
                    ].join(""),
                  },
                ]
                : [
                  {
                    kind: "toggle" as const,
                    key: "browserAutomationEnabled",
                    label: "启用 MCP 浏览器自动化",
                    desc: "Phase 4 安全能力尚未通过，无法开启自动化。",
                    disabled: true,
                    statusText: "未就绪",
                    statusColor: "#65615A",
                  },
                  {
                    kind: "note" as const,
                    text: [
                      `能力原因：${ctx.browserSecurity.securityReason || "phase4-security-incomplete"}。`,
                      "请使用已通过安全门验证的构建；无法通过环境变量绕过。",
                    ].join(""),
                  },
                ]),
            ],
          },
          {
            title: "浏览器授权（本次运行）",
            rows: [
              { kind: "note", text: "这里只显示本次打开 Auris 期间记住的网站操作授权。关掉 App 后会清空；关掉本页不会撤销。" },
              { kind: "browserGrants" },
            ],
          },
          {
            title: "安装 MCP 配置",
            rows: [
              { kind: "note", text: "配置 AI 助手以连接到 Auris MCP 服务器。" },
              { kind: "installer", key: "claudeDesktop", name: "Claude Desktop", filename: "claude_desktop_config.json" },
              { kind: "installer", key: "claudeCode", name: "Claude Code", filename: ".claude.json" },
              { kind: "installer", key: "codexCli", name: "Codex CLI", filename: "config.toml" },
              { kind: "installer", key: "geminiCli", name: "Gemini CLI", filename: "settings.json" },
            ],
          },
          {
            title: "AI 提供商", rows: [{ kind: "note", text: "当前桌面端尚未提供全局 AI 提供商切换。模型选择由具体功能的连接与运行时能力决定，以下目录仅作只读展示。" },
              { kind: "button", label: "检测 CLI 提供商", desc: "扫描已安装的 AI CLI（claude、codex、gemini、ollama）", btnText: ctx.cliBusy ? "检测中…" : "检测", variant: "default", align: "right", icon: "refresh-cw", action: "detectCli" },
              { kind: "subhead", text: "CLI 提供商" },
              { kind: "radio", group: "ai", id: "claude", name: "Claude", status: ctx.cliStatus.claude.status, statusColor: ctx.cliStatus.claude.color, disabled: ctx.cliStatus.claude.disabled },
              { kind: "radio", group: "ai", id: "codex", name: "Codex", status: ctx.cliStatus.codex.status, statusColor: ctx.cliStatus.codex.color, disabled: ctx.cliStatus.codex.disabled },
              { kind: "radio", group: "ai", id: "gemini", name: "Gemini", status: ctx.cliStatus.gemini.status, statusColor: ctx.cliStatus.gemini.color, disabled: ctx.cliStatus.gemini.disabled },
              { kind: "subhead", text: "REST API 提供商" },
              { kind: "radio", group: "ai", id: "anthropic", name: "Anthropic", disabled: true, status: "暂不可用", statusColor: "#65615A" },
              { kind: "radio", group: "ai", id: "openai", name: "OpenAI", disabled: true, status: "暂不可用", statusColor: "#65615A" },
              { kind: "radio", group: "ai", id: "googleai", name: "Google AI", disabled: true, status: "暂不可用", statusColor: "#65615A" },
              { kind: "radio", group: "ai", id: "ollama", name: "Ollama (API)", disabled: true, status: "暂不可用", statusColor: "#65615A" },
            ],
          },
        ],
      };

    case "language":
      return {
        title: "语言",
        sections: [
          {
            title: "作用范围",
            rows: [{ kind: "note", text: "以下排版规则供“一键中文排版”命令读取；保存设置本身不会立即改写当前文档。" }],
          },
          {
            title: "界面",
            rows: [{ kind: "notesLocale" }],
          },
          {
            title: "空格",
            rows: [
              { kind: "toggle", key: "removeSlashSpacing", label: "移除斜杠间距", desc: "A / B -> A/B（保留 URL）" },
              { kind: "toggle", key: "collapseSpaces", label: "折叠多个空格", desc: "多个空格 -> 单个空格" },
            ],
          },
          {
            title: "破折号与引号",
            rows: [
              { kind: "toggle", key: "convertDashes", label: "转换破折号", desc: "-- → —— CJK 之间" },
              { kind: "toggle", key: "fixEmDashSpacing", label: "修复 em 破折号间距", desc: "—— 周围的适当间距" },
              { kind: "toggle", key: "convertStraightQuotes", label: "转换直引号", desc: "将 \" 和 ' 转换为智能引号" },
              { kind: "select", key: "quoteStyle", label: "引号样式", desc: "引号转换的目标样式", options: ["弯引号 “”‘’", "直角引号 「」", "书名号 《》"] },
              { kind: "toggle", key: "contextAwareQuotes", label: "上下文感知引号", desc: "CJK 文本周围使用弯引号，纯拉丁文本中使用直引号" },
              { kind: "select", key: "quoteToggleBehavior", label: "引号切换行为", desc: "引号样式切换命令在各样式之间循环的方式", options: ["简单（直引号 ↔ 首选）", "循环全部样式"] },
              { kind: "toggle", key: "fixDoubleQuoteSpacing", label: "修复双引号间距", desc: "“” 周围的间距" },
              { kind: "toggle", key: "fixSingleQuoteSpacing", label: "修复单引号间距", desc: "‘’ 周围的间距" },
              { kind: "toggle", key: "cjkCornerQuotes", label: "CJK 角引号", desc: "“Chinese” → 「Chinese」（繁体中文/日文）" },
              { kind: "toggle", key: "nestedCornerQuotes", label: "嵌套角引号", desc: "嵌套 “” → 『』 在 「」 内" },
            ],
          },
          {
            title: "清理",
            rows: [
              { kind: "select", key: "limitConsecutivePunct", label: "限制连续标点符号", desc: "限制重复的 !?.", options: ["关闭", "限制为 1", "限制为 3"] },
              { kind: "toggle", key: "removeTrailingSpaces", label: "移除尾部空格", desc: "移除行末的空格" },
              { kind: "toggle", key: "normalizeEllipsis", label: "规范化省略号", desc: ". . . -> …" },
              { kind: "toggle", key: "collapseNewlines", label: "折叠换行符", desc: "3+ 换行符 -> 2" },
            ],
          },
          {
            title: "章节处理",
            rows: [{ kind: "toggle", key: "skipReferenceSections", label: "跳过参考章节", desc: "不格式化“参考文献”和“延伸阅读”章节" }],
          },
        ],
      };

    case "markdown":
      return {
        title: "Markdown",
        sections: [
          {
            title: "渲染布局",
            rows: [
              {
                kind: "select",
                key: "blockFontSize",
                label: "正文大小",
                desc: "调整笔记正文的相对字号",
                options: ["较小", "标准", "较大"],
              },
              {
                kind: "select",
                key: "headingAlign",
                label: "标题对齐",
                desc: "设置 Markdown 标题的对齐方式",
                options: ["左对齐", "居中", "右对齐"],
              },
              {
                kind: "select",
                key: "imageBorder",
                label: "图片边框",
                desc: "设置笔记中图片的边框样式",
                options: ["无边框", "细边框", "粗边框"],
              },
            ],
          },
          {
            title: "输入与检查",
            rows: [
              {
                kind: "note",
                text: "智能粘贴、原始 HTML、表格适宽、图片粘贴缩放、正则搜索和 Markdown 检查尚未形成完整的编辑器实现；相关开关已移除，避免保存无效配置。",
              },
            ],
          },
        ],
      };

    case "shortcuts":
      return {
        title: "快捷键",
        sections: [
          {
            title: "工作台",
            rows: [
              {
                kind: "note",
                text: "这里的绑定直接驱动 Notes 命令总线。修改后立即广播到已打开的工作台；导入只接受 schemaVersion 1 的快捷键文件，同层重复绑定会明确报告冲突。",
              },
              { kind: "shortcutEditor" },
            ],
          },
        ],
      };

    case "terminal":
      return {
        title: "终端",
        sections: [
          {
            title: "终端偏好",
            rows: [
              {
                kind: "note",
                text: "终端会话目前使用经过验证的内置配置。Shell、布局、字体、渲染、响铃和无障碍偏好尚未形成完整的持久化与运行时映射，因此暂不显示可切换控件，以避免产生无效配置。",
              },
            ],
          },
        ],
      };

    case "about":
      return {
        title: "关于",
        aboutHeader: true,
        aboutLinks: [
          { icon: "globe", label: "网站", href: "https://auris.app" },
          { icon: "github", label: "GitHub", href: "https://github.com" },
        ],
        sections: [
          {
            title: "更新",
            rows: [{ kind: "appUpdates" }],
          },
          {
            title: "重置",
            rows: [
              { kind: "button", label: "重置所有设置", desc: "将每项设置恢复为默认值", btnText: "恢复默认值", variant: "danger", align: "right", action: "resetAll" },
            ],
          },
        ],
      };

    default:
      return { title: "设置", sections: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const SETTINGS_CSS = `
.auris-settings{height:100vh;max-height:100vh;display:flex;background:var(--app-bg);color:var(--app-text);font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased;}
.auris-settings *{box-sizing:border-box;}
.auris-settings ::-webkit-scrollbar{width:11px;height:11px;}
.auris-settings ::-webkit-scrollbar-thumb{background:var(--app-fill-strong);border-radius:11px;border:3px solid var(--app-bg);}
.auris-settings ::-webkit-scrollbar-thumb:hover{background:var(--app-line);}
.auris-settings ::-webkit-scrollbar-track{background:transparent;}
.auris-settings input::placeholder{color:var(--app-muted);}

.auris-settings__sidebar{width:262px;flex:0 0 262px;border-right:1px solid var(--app-line-soft);background:var(--app-surface);display:flex;flex-direction:column;min-height:0;}
.auris-settings__searchwrap{padding:18px 16px 14px;}
.auris-settings__searchbox{display:flex;align-items:center;gap:10px;height:40px;padding:0 13px;border-radius:11px;border:1px solid var(--app-line);background:var(--app-fill);}
.auris-settings__searchinput{flex:1;min-width:0;background:transparent;border:none;outline:none;color:var(--app-text);font-size:13.5px;font-family:inherit;}
.auris-settings__nav{flex:1;overflow-y:auto;min-height:0;padding:0 12px 18px;display:flex;flex-direction:column;gap:3px;}
.auris-settings__cat{width:100%;display:flex;align-items:center;gap:13px;padding:10px 13px;border-radius:11px;font-size:14px;cursor:pointer;font-family:inherit;text-align:left;transition:all .15s;background:transparent;border:1px solid transparent;color:var(--app-muted);font-weight:400;}
.auris-settings__cat:hover{background:var(--app-fill);color:var(--app-text-soft);}
.auris-settings__cat[data-active="true"]{background:var(--accent-10);border:1px solid var(--accent-28);color:var(--accent);font-weight:500;}
.auris-settings__cat[data-active="true"]:hover{background:var(--accent-10);color:var(--accent);}
.auris-settings__cat-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

.auris-settings__main{flex:1;min-width:0;overflow-y:auto;}
.auris-settings__page{max-width:780px;margin:0 auto;padding:46px 56px 120px;}
.auris-settings__eyebrow{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;letter-spacing:0.24em;color:var(--accent);text-transform:uppercase;}
.auris-settings__title{margin:14px 0 0;font-family:'Newsreader','Noto Serif SC',serif;font-weight:500;font-size:38px;line-height:1.2;letter-spacing:-0.01em;color:var(--app-ink);}
.auris-settings__divider{height:1px;background:var(--app-line);margin-top:30px;}

.auris-settings__about-header{margin-top:38px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;}
.auris-settings__about-id{display:flex;align-items:center;gap:18px;}
.auris-settings__about-logo{width:64px;height:64px;border-radius:17px;border:1px solid var(--accent-28);background:var(--accent-10);display:grid;place-items:center;color:var(--accent);font-family:'Newsreader','Noto Serif SC',serif;font-size:36px;font-weight:500;}
.auris-settings__about-name{font-family:'Newsreader','Noto Serif SC',serif;font-size:26px;color:var(--app-ink);}
.auris-settings__about-version{margin-top:5px;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12.5px;color:var(--app-muted);}
.auris-settings__about-links{display:flex;flex-direction:column;gap:10px;align-items:flex-end;}
.auris-settings__about-link{display:inline-flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;color:var(--app-text-soft);font-size:13.5px;font-family:inherit;transition:color .18s;}
.auris-settings__about-link:hover{color:var(--accent);}

.auris-settings__section{margin-top:40px;}
.auris-settings__section-title{display:flex;gap:11px;align-items:center;margin-bottom:6px;}
.auris-settings__section-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);flex:0 0 auto;}
.auris-settings__section-title>span:last-child{font-size:13.5px;letter-spacing:0.04em;color:var(--app-text-soft);font-weight:600;}

.auris-settings__row{padding:16px 2px;border-bottom:1px solid var(--app-line-soft);}
.auris-settings__row--split{display:flex;align-items:center;justify-content:space-between;gap:28px;}
.auris-settings__row--key{padding:15px 2px;}
.auris-settings__row--info{padding:11px 2px;gap:20px;border-bottom:1px solid var(--app-line-soft);}
.auris-settings__row--radio{padding:15px 2px;gap:20px;border-bottom:1px solid var(--app-line-soft);}
.auris-settings__row-text{min-width:0;}
.auris-settings__row-label{font-size:15.5px;font-weight:500;color:var(--app-text);}
.auris-settings__row-desc{margin-top:5px;font-size:13px;line-height:1.55;color:var(--app-muted);}
.auris-settings__row-control{display:flex;align-items:center;gap:14px;flex:0 0 auto;}
.auris-settings__status{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;}
.auris-settings__status-dot{width:7px;height:7px;border-radius:50%;}

.auris-settings__track{width:46px;height:27px;flex:0 0 auto;border-radius:999px;cursor:pointer;position:relative;transition:all .2s;}
.auris-settings__knob{position:absolute;top:2px;left:2px;width:21px;height:21px;border-radius:50%;transition:transform .2s;}

.auris-settings__select{display:inline-flex;align-items:center;gap:9px;flex:0 0 auto;height:34px;padding:0 11px 0 14px;border-radius:9px;border:1px solid var(--app-line);font-size:13.5px;font-family:inherit;transition:all .18s;background:var(--app-fill);color:var(--app-text);cursor:pointer;}
.auris-settings__select:hover{border-color:var(--accent-28);}
.auris-settings__select[data-disabled="true"]{background:transparent;color:var(--app-muted);cursor:default;border-color:var(--app-line);}

.auris-settings__key-label{font-size:15px;color:var(--app-text);}
.auris-settings__key-desc{margin-top:4px;font-size:12.5px;color:var(--app-muted);font-family:ui-monospace,'SF Mono',Menlo,monospace;}
.auris-settings__keys{display:flex;gap:6px;flex:0 0 auto;}
.auris-settings__cap{min-width:28px;height:28px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;border:1px solid var(--app-line);background:var(--app-fill);color:var(--app-text-soft);font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:13px;}

.auris-settings__text-label{margin-bottom:10px;}
.auris-settings__text-controls{display:flex;gap:10px;align-items:center;}
.auris-settings__text-input{flex:1;min-width:0;height:38px;background:var(--app-fill);border:1px solid var(--app-line);border-radius:9px;padding:0 13px;color:var(--app-text);font-size:13px;font-family:ui-monospace,'SF Mono',Menlo,monospace;outline:none;}
.auris-settings__text-input:focus{border-color:var(--accent-28);}
.auris-settings__browse{height:38px;padding:0 16px;flex:0 0 auto;border-radius:9px;border:1px solid var(--app-line);background:var(--app-fill);color:var(--app-text-soft);font-size:13.5px;cursor:pointer;font-family:inherit;transition:all .18s;}
.auris-settings__browse:hover{border-color:var(--accent-28);color:var(--app-text);}

.auris-settings__btn{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 16px;border-radius:9px;font-size:13.5px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .18s;}
.auris-settings__btn[data-variant="default"]{background:var(--app-fill);color:var(--app-text-soft);border:1px solid var(--app-line);}
.auris-settings__btn[data-variant="primary"]{color:var(--accent-ink);border:none;}
.auris-settings__btn[data-variant="danger"]{background:transparent;color:#D98A7E;border:1px solid rgba(217,138,126,0.4);}

.auris-settings__info-left{display:flex;align-items:center;gap:9px;min-width:0;}
.auris-settings__info-label{font-size:13.5px;color:var(--app-muted);}
.auris-settings__info-right{display:flex;align-items:center;gap:8px;flex:0 0 auto;}
.auris-settings__info-value{font-size:13px;}

.auris-settings__radio-left{display:flex;align-items:center;gap:13px;min-width:0;}
.auris-settings__radio-circle{width:20px;height:20px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;}
.auris-settings__radio-dot{border-radius:50%;}

.auris-settings__installer-left{display:flex;align-items:center;gap:13px;min-width:0;}
.auris-settings__installer-circle{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--app-line);flex:0 0 auto;display:block;}
.auris-settings__installer-name{font-size:15px;color:var(--app-text);}
.auris-settings__installer-file{margin-top:3px;display:flex;align-items:center;gap:6px;}
.auris-settings__installer-file>span{font-size:12.5px;color:var(--app-muted);font-family:ui-monospace,'SF Mono',Menlo,monospace;}
.auris-settings__installer-actions{display:flex;gap:8px;flex:0 0 auto;}
.auris-settings__btn-sm{height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--app-line);background:var(--app-fill);color:var(--app-text-soft);font-size:13px;cursor:pointer;font-family:inherit;}
.auris-settings__btn-sm--primary{padding:0 15px;border:none;color:var(--accent-ink);font-weight:600;}
.auris-settings__btn-sm--danger{border:1px solid rgba(217,138,126,0.4);background:transparent;color:#D98A7E;}

.auris-settings__subhead{padding:20px 2px 6px;font-size:12px;letter-spacing:0.1em;color:var(--app-muted);text-transform:uppercase;font-weight:500;}
.auris-settings__note{padding:8px 2px 16px;font-size:13px;line-height:1.65;color:var(--app-muted);}

.auris-settings__swatches{padding:22px 2px 12px;display:flex;gap:24px;flex-wrap:wrap;}
.auris-settings__swatch{display:flex;flex-direction:column;align-items:center;gap:11px;cursor:pointer;}
.auris-settings__swatch-ring{padding:3px;border-radius:50%;transition:all .18s;}
.auris-settings__swatch-dot{width:52px;height:52px;border-radius:50%;border:1px solid var(--app-line);box-shadow:inset 0 1px 2px rgba(0,0,0,0.2);}
.auris-settings__swatch-name{font-size:13px;transition:color .18s;}

.auris-settings__shortcutbar{padding:12px 2px 18px;display:flex;gap:12px;align-items:center;}
.auris-settings__shortcutbar-search{flex:1;min-width:0;display:flex;align-items:center;gap:9px;height:38px;padding:0 13px;border-radius:9px;border:1px solid var(--app-line);background:var(--app-fill);}
.auris-settings__shortcutbar .auris-settings__btn-sm{height:38px;padding:0 15px;border-radius:9px;font-size:13.5px;}

.auris-settings__shortcut-editor{padding:4px 0 10px;}
.auris-settings__shortcut-editor .auris-settings__shortcutbar{padding-left:0;padding-right:0;}
.auris-settings__shortcut-editor .auris-settings__shortcutbar>.auris-settings__searchinput{height:38px;padding:0 13px;border:1px solid var(--app-line);border-radius:9px;background:var(--app-fill);}
.auris-settings__shortcut-editor label>span{display:grid;gap:4px;}
.auris-settings__shortcut-editor label small{color:var(--app-muted);font-family:ui-monospace,'SF Mono',Menlo,monospace;}
.auris-settings__shortcut-input{width:180px;height:36px;padding:0 12px;border:1px solid var(--app-line);border-radius:9px;background:var(--app-fill);color:var(--app-text);font-family:ui-monospace,'SF Mono',Menlo,monospace;outline:none;}
.auris-settings__shortcut-input:focus{border-color:var(--accent);}
.auris-settings__shortcut-error{margin:10px 0 0;color:#D98A7E;font-size:13px;}

.browser-grant-center{padding:4px 2px 12px;display:flex;flex-direction:column;gap:12px;}
.browser-grant-center__hint,.browser-grant-center__empty,.browser-grant-center--unavailable p{margin:0;font-size:13px;line-height:1.6;color:var(--app-muted);}
.browser-grant-center__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}
.browser-grant-center__list li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--app-line);border-radius:12px;background:var(--app-fill);}
.browser-grant-center__list strong{display:block;font-size:13.5px;color:var(--app-text);}
.browser-grant-center__list span{display:block;margin-top:4px;font-size:12px;color:var(--app-muted);word-break:break-all;}
.browser-grant-center__list button{flex-shrink:0;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--app-line);background:transparent;color:var(--app-text);font-size:13px;cursor:pointer;}
.browser-grant-center__list button:disabled{opacity:0.55;cursor:default;}
`;
