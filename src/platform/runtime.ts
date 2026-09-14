import { hasDesktopBridge } from "@/platform/desktop/desktop-runtime";

export type AppPlatform = "android" | "desktop" | "ios" | "web";

export type RuntimeInfo = {
  isDesktopApp: boolean;
  isNativeApp: boolean;
  platform: AppPlatform;
};

type RuntimeInfoInput = {
  hasDesktopBridge?: boolean;
  hasWindow?: boolean;
  isCapacitorNativePlatform?: boolean;
  platform?: string | null;
};

type CapacitorLike = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
};

function normalizePlatform(value: string | null | undefined): AppPlatform {
  if (value === "ios" || value === "android") {
    return value;
  }

  if (value === "desktop") {
    return value;
  }

  return "web";
}

export function createRuntimeInfo(input?: RuntimeInfoInput): RuntimeInfo {
  const hasWindow = input?.hasWindow ?? typeof window !== "undefined";
  const isDesktopApp = hasWindow && Boolean(input?.hasDesktopBridge);
  const isNativeApp = hasWindow && Boolean(input?.isCapacitorNativePlatform);
  const platform = isDesktopApp
    ? "desktop"
    : isNativeApp
      ? normalizePlatform(input?.platform)
      : "web";

  return {
    isDesktopApp,
    isNativeApp,
    platform,
  };
}

function getGlobalCapacitor() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  const value = (globalThis as typeof globalThis & { Capacitor?: CapacitorLike }).Capacitor;
  return value ?? null;
}

export function detectRuntime(): RuntimeInfo {
  const capacitor = getGlobalCapacitor();

  return createRuntimeInfo({
    hasDesktopBridge: hasDesktopBridge(),
    hasWindow: typeof window !== "undefined",
    isCapacitorNativePlatform: capacitor?.isNativePlatform?.() ?? false,
    platform: capacitor?.getPlatform?.() ?? "web",
  });
}
