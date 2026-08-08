import { normalizeDesktopRuntimeState } from "@/features/app-runtime/app-runtime-storage";
import type {
  DesktopAiDockState,
  DesktopRuntimeState,
} from "@/features/app-runtime/app-runtime.types";

export function readDesktopAiDockState(
  runtimeState: Partial<DesktopRuntimeState> | null | undefined,
): DesktopAiDockState {
  return normalizeDesktopRuntimeState(runtimeState).aiDock;
}
