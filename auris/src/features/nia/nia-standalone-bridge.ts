"use client";

import type { NiaStandaloneLaunch } from "@/features/nia/nia-standalone-store";

export type NiaStandaloneBridge = Readonly<{
  open: (launch?: NiaStandaloneLaunch) => Promise<boolean>;
  subscribeLaunch: (listener: (launch: NiaStandaloneLaunch) => void) => () => void;
}>;

type NiaStandaloneHost = Readonly<{
  shadowingDesktop?: Readonly<{
    niaStandalone?: NiaStandaloneBridge;
  }>;
}>;

export function getNiaStandaloneBridge(host: unknown): NiaStandaloneBridge | null {
  if (!host || (typeof host !== "object" && typeof host !== "function")) {
    return null;
  }
  const bridge = (host as NiaStandaloneHost).shadowingDesktop?.niaStandalone;
  if (!bridge || typeof bridge.open !== "function" || typeof bridge.subscribeLaunch !== "function") {
    return null;
  }
  return bridge;
}
