import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";

export function getDesktopVideoLibraryBridge() {
  return getDesktopBridge()?.videoLibrary ?? null;
}
