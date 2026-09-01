export type VaultWriteConflict = {
  expectedRawSource: string | null;
  localRawSource: string;
  path: string;
  remoteRawSource: string | null;
};

export type VaultWriteConflictCurrentState = {
  currentDiskContent: string | null;
  dirty: boolean;
  documentPath: string | null;
};

export type VaultWriteConflictStaleReason =
  | "disk-changed"
  | "document-moved"
  | "not-dirty";

/**
 * A conflict dialog is a delayed decision. Revalidate the captured path,
 * dirty state and disk version before applying either destructive choice.
 */
export function getVaultWriteConflictStaleReason(
  conflict: VaultWriteConflict,
  current: VaultWriteConflictCurrentState,
): VaultWriteConflictStaleReason | null {
  if (!current.dirty) return "not-dirty";
  if (current.documentPath !== conflict.path) return "document-moved";
  if (current.currentDiskContent !== conflict.remoteRawSource) {
    return "disk-changed";
  }
  return null;
}

function splitConflictLines(source: string | null) {
  return (source ?? "").replace(/\r\n/g, "\n").split("\n");
}

function trimCommonSuffix(
  remoteLines: string[],
  localLines: string[],
  prefixLength: number,
) {
  let suffixLength = 0;

  while (
    suffixLength < remoteLines.length - prefixLength &&
    suffixLength < localLines.length - prefixLength &&
    remoteLines[remoteLines.length - 1 - suffixLength] ===
      localLines[localLines.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return suffixLength;
}

export function buildVaultWriteConflictDiff(conflict: VaultWriteConflict) {
  const remoteLines = splitConflictLines(conflict.remoteRawSource);
  const localLines = splitConflictLines(conflict.localRawSource);
  let prefixLength = 0;

  while (
    prefixLength < remoteLines.length &&
    prefixLength < localLines.length &&
    remoteLines[prefixLength] === localLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  const suffixLength = trimCommonSuffix(
    remoteLines,
    localLines,
    prefixLength,
  );
  const remoteChangeLines = remoteLines.slice(
    prefixLength,
    remoteLines.length - suffixLength,
  );
  const localChangeLines = localLines.slice(
    prefixLength,
    localLines.length - suffixLength,
  );
  const normalizedPath = conflict.path.replace(/\\/g, "/");
  const headerLines = [
    `--- remote/${normalizedPath}`,
    `+++ local/${normalizedPath}`,
    `@@ line ${prefixLength + 1} @@`,
  ];

  if (remoteChangeLines.length === 0 && localChangeLines.length === 0) {
    return [...headerLines, "(no changes)"].join("\n");
  }

  return [
    ...headerLines,
    ...remoteChangeLines.map((line) => `- ${line}`),
    ...localChangeLines.map((line) => `+ ${line}`),
  ].join("\n");
}
