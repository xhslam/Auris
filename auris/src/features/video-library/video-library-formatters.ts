import type {
  DesktopVideoAnalysisStatus,
  DesktopVideoImportState,
} from "@/features/video-library/video-library.types";

export function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) {
    return "时长待识别";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}

export function formatFileSize(fileSizeBytes: number | null) {
  if (!fileSizeBytes || fileSizeBytes <= 0) {
    return "大小待识别";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = fileSizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatResolution(width: number | null, height: number | null) {
  if (!width || !height) {
    return "分辨率待识别";
  }

  return `${width} × ${height}`;
}

export function getImportStateLabel(importState: DesktopVideoImportState) {
  return importState === "missing" ? "源文件丢失" : "已就绪";
}

export function getAnalysisStatusLabel(status: DesktopVideoAnalysisStatus) {
  switch (status) {
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "queued":
      return "排队中";
    case "running":
      return "进行中";
    default:
      return "待开始";
  }
}
