import {
  createWebNotificationService,
} from "@/platform/notifications/web-notification-service";

export type NotificationService = ReturnType<typeof createWebNotificationService>;

export function createNotificationService(): NotificationService {
  return createWebNotificationService();
}
