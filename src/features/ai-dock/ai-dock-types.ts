import type {
  DesktopAiDockView,
  DesktopAiProviderId,
} from "@/features/app-runtime/app-runtime.types";
import type {
  DesktopAiHistoryRecord,
  DesktopAiPromptRecord,
} from "@/platform/desktop/desktop-bridge";

export const DESKTOP_AI_PROVIDER_LABELS: Record<DesktopAiProviderId, string> = {
  chatgpt: "ChatGPT",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  google: "Google",
};

export const DESKTOP_AI_DOCK_VIEW_LABELS: Record<DesktopAiDockView, string> = {
  history: "Chat History",
  prompts: "Prompt Library",
  provider: "Provider",
};

export type DesktopAiDockLibraryStatus = "idle" | "loading";

export type DesktopAiDockPromptLibraryState = {
  prompts: DesktopAiPromptRecord[];
  query: string;
  status: DesktopAiDockLibraryStatus;
};

export type DesktopAiDockHistoryLibraryState = {
  history: DesktopAiHistoryRecord[];
  query: string;
  selectedHistoryId: number | null;
  status: DesktopAiDockLibraryStatus;
};
