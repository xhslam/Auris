import {
  getVaultFileName,
  getVaultParentPath,
  normalizeVaultPath,
} from "@/features/notes/vault/vault-path";

export type MoveEntryPlan =
  | { type: "noop" }
  | { type: "invalid"; reason: "into-self" | "collision" }
  | { type: "move"; nextPath: string };

type BuildMoveEntryPlanInput = {
  /** Paths of every existing vault entry, used to reject name collisions. */
  existingPaths: string[];
  /** The file or folder being moved. */
  sourcePath: string;
  /** The destination folder ("" / root means the vault root). */
  targetFolderPath: string;
};

/**
 * Computes the result of dragging `sourcePath` into `targetFolderPath`,
 * keeping the entry's own name. Returns a `noop` when nothing would change,
 * `invalid` for moves into self/descendants or onto an existing name, and a
 * `move` carrying the destination path otherwise.
 */
export function buildMoveEntryPlan(
  input: BuildMoveEntryPlanInput,
): MoveEntryPlan {
  const source = normalizeVaultPath(input.sourcePath).replace(/\/+$/, "");
  const folder = normalizeVaultPath(input.targetFolderPath)
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");

  if (!source) {
    return { type: "noop" };
  }

  // A folder cannot be moved into itself or one of its own descendants.
  if (folder === source || folder.startsWith(`${source}/`)) {
    return { reason: "into-self", type: "invalid" };
  }

  // Already living directly inside the target folder.
  if (getVaultParentPath(source) === folder) {
    return { type: "noop" };
  }

  const basename = getVaultFileName(source);
  const nextPath = folder ? `${folder}/${basename}` : basename;

  if (nextPath === source) {
    return { type: "noop" };
  }

  const collides = input.existingPaths.some(
    (path) =>
      normalizeVaultPath(path).replace(/\/+$/, "").toLowerCase() ===
      nextPath.toLowerCase(),
  );

  if (collides) {
    return { reason: "collision", type: "invalid" };
  }

  return { nextPath, type: "move" };
}
