"use client";

import { useEffect } from "react";
import { executeReviewMcpRequest } from "@/features/output-review/review-mcp-handler";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

/** Mounted in every main workspace, independent from the Notes facade. */
export function useDesktopReviewMcp(bridge: DesktopBridge | null) {
  useEffect(() => bridge?.reviewMcp?.onRequest(request =>
    executeReviewMcpRequest(request, window.localStorage)), [bridge]);
}
