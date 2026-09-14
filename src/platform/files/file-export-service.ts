import { createDesktopFileExportService } from "@/platform/files/desktop-file-export-service";
import { createWebFileExportService } from "@/platform/files/web-file-export-service";
import { detectRuntime, type RuntimeInfo } from "@/platform/runtime";

export type FileExportService =
  | ReturnType<typeof createDesktopFileExportService>
  | ReturnType<typeof createWebFileExportService>;

type CreateFileExportServiceOptions = {
  runtime?: RuntimeInfo;
};

export function createFileExportService(
  options?: CreateFileExportServiceOptions,
): FileExportService {
  const runtime = options?.runtime ?? detectRuntime();

  if (runtime.isDesktopApp) {
    return createDesktopFileExportService();
  }

  return createWebFileExportService();
}
