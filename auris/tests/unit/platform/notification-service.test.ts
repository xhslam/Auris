import { createNotificationService } from "@/platform/notifications/notification-service";

describe("notification service", () => {
  it("uses web notifications in the browser", () => {
    const service = createNotificationService();

    expect(service.kind).toBe("web");
  });
});
