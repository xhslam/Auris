import { createRuntimeInfo } from "@/platform/runtime";

describe("runtime detection", () => {
  it("treats the browser as web by default", () => {
    const runtime = createRuntimeInfo({
      hasWindow: true,
      isCapacitorNativePlatform: false,
    });

    expect(runtime.platform).toBe("web");
    expect(runtime.isNativeApp).toBe(false);
    expect(runtime.isDesktopApp).toBe(false);
  });

  it("treats native capacitor containers as mobile apps", () => {
    const runtime = createRuntimeInfo({
      hasWindow: true,
      isCapacitorNativePlatform: true,
      platform: "ios",
    });

    expect(runtime.platform).toBe("ios");
    expect(runtime.isNativeApp).toBe(true);
    expect(runtime.isDesktopApp).toBe(false);
  });

  it("treats a desktop bridge as a desktop app runtime", () => {
    const runtime = createRuntimeInfo({
      hasDesktopBridge: true,
      hasWindow: true,
      isCapacitorNativePlatform: false,
    });

    expect(runtime.platform).toBe("desktop");
    expect(runtime.isDesktopApp).toBe(true);
    expect(runtime.isNativeApp).toBe(false);
  });
});
