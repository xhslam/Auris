import type { VaultEntry } from "@/features/notes/vault/vault-types";

export function sortVaultEntries(entries: VaultEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }

    return left.path.localeCompare(right.path);
  });
}
