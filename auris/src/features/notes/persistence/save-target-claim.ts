/**
 * Per-document save-target claims.
 *
 * Purpose: decide whether a finished write is still allowed to change its
 * document's identity (file path, baseline, dirty state, saved snapshots), or
 * whether a newer save or rename has since superseded it.
 *
 * Aligned with vmark 2026-09-06 audit finding F3:
 * Saves are serialized per PATH, so an autosave to `old.md` and a rename/Save-As
 * to `new.md` belong to different queues and can run concurrently. Without a
 * claim, a late autosave completion could re-point the document and restore stale
 * memory baselines.
 *
 * A claim is taken at SUBMISSION time, so ordering reflects the order the user
 * requested the saves.
 *
 * @module features/notes/persistence/save-target-claim
 */

const latestClaim = new Map<string, number>();

export interface SaveTargetClaim {
  readonly path: string;
  readonly seq: number;
}

/**
 * Take a claim for a save that is about to be submitted for `path`.
 * Call this before queuing or executing the asynchronous write.
 */
export function claimSaveTarget(path: string): SaveTargetClaim {
  const seq = (latestClaim.get(path) ?? 0) + 1;
  latestClaim.set(path, seq);
  return { path, seq };
}

/**
 * Whether `claim` is still the newest one for its document path.
 * Returns `false` if another save or an invalidation has superseded it.
 */
export function isCurrentSaveTarget(claim: SaveTargetClaim): boolean {
  return latestClaim.get(claim.path) === claim.seq;
}

/**
 * Invalidate in-flight claims for `path` (e.g. when a document is renamed or deleted).
 */
export function invalidateSaveTarget(path: string): void {
  const current = latestClaim.get(path) ?? 0;
  latestClaim.set(path, current + 1);
}

/**
 * Forget a closed or removed document path so memory does not leak.
 */
export function forgetSaveTarget(path: string): void {
  latestClaim.delete(path);
}

/**
 * Test seam: reset all claims.
 */
export function resetSaveTargetClaims(): void {
  latestClaim.clear();
}
