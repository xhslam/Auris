import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";

export function createDesktopClientHeaders(init?: HeadersInit) {
  const headers = new Headers(init);

  if (getDesktopBridge()) {
    headers.set("x-shadowing-client", "desktop");
  }

  return headers;
}
