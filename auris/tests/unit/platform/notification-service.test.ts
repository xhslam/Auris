import { createNotificationService } from "@/platform/notifications/notification-service";

describe("notification service", () => {
  it("uses web notifications in the browser", () => {
    const service = createNotificationService({
      runtime: { isNativeApp: false, platform: "web" },
    });

    expect(service.kind).toBe("web");
  });

  it("uses native notifications inside mobile app containers", () => {
    const service = createNotificationService({
      runtime: { isNativeApp: true, platform: "ios" },
    });

    expect(service.kind).toBe("native");
  });
});
