export type DesktopVideoLibraryStorageMode = "reference";

export type DesktopVideoImportState = "ready" | "missing";

export type DesktopVideoPlaybackStrategy = "source-preferred";

export type DesktopVideoAnalysisStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type DesktopVideoAnalysisTaskType =
  | "transcript"
  | "chaptering"
  | "quality-ladder";

export type DesktopVideoVariantKind = "source" | "transcode";

export type DesktopVideoVariantStatus = "ready" | "pending" | "failed";

export type DesktopVideoLibraryDirectoryInfo = {
  analysisDirectory: string | null;
  directoryName: string | null;
  hasLibrary: boolean;
  libraryPath: string | null;
  storageMode: DesktopVideoLibraryStorageMode;
  thumbnailsDirectory: string | null;
  transcodesDirectory: string | null;
};

export type DesktopVideoLibraryItem = {
  analysisStatus: DesktopVideoAnalysisStatus;
  durationMs: number | null;
  extension: string;
  fileSizeBytes: number | null;
  height: number | null;
  id: string;
  importState: DesktopVideoImportState;
  importedAt: string;
  mimeType: string | null;
  playbackStrategy: DesktopVideoPlaybackStrategy;
  posterUrl: string | null;
  sourceFileName: string;
  sourcePath: string;
  sourceUrl: string;
  title: string;
  updatedAt: string;
  variantCount: number;
  width: number | null;
};

export type DesktopVideoVariant = {
  durationMs: number | null;
  height: number | null;
  id: string;
  kind: DesktopVideoVariantKind;
  label: string;
  mimeType: string | null;
  playbackUrl: string | null;
  status: DesktopVideoVariantStatus;
  storagePath: string | null;
  width: number | null;
};

export type DesktopVideoAnalysisJob = {
  createdAt: string;
  id: string;
  message: string | null;
  status: DesktopVideoAnalysisStatus;
  taskType: DesktopVideoAnalysisTaskType;
  updatedAt: string;
};

export type DesktopVideoDetails = {
  analysisJobs: DesktopVideoAnalysisJob[];
  variants: DesktopVideoVariant[];
  video: DesktopVideoLibraryItem;
};

export type DesktopVideoLibrarySnapshot = {
  directory: DesktopVideoLibraryDirectoryInfo;
  items: DesktopVideoLibraryItem[];
};

export type DesktopVideoThumbnailInput = {
  bytes: Uint8Array;
  contentType: string | null;
};

export type DesktopVideoMetadataInput = {
  durationMs: number | null;
  height: number | null;
  width: number | null;
};
