import {
  createFileExportService,
  type FileExportService,
} from "@/platform/files/file-export-service";
import {
  createNotificationService,
  type NotificationService,
} from "@/platform/notifications/notification-service";

let fileExportService: FileExportService | null = null;
let notificationService: NotificationService | null = null;

export function getFileExportService() {
  if (!fileExportService) {
    fileExportService = createFileExportService();
  }

  return fileExportService;
}

export function getNotificationService() {
  if (!notificationService) {
    notificationService = createNotificationService();
  }

  return notificationService;
}
