import { normalizeVaultPath } from "@/features/notes/vault/vault-path";

type PendingNoteSave = {
  content: string;
  token: number;
};

const pendingSaves = new Map<string, PendingNoteSave>();
let nextToken = 1;

export function registerPendingNoteSave(path: string, content: string) {
  const token = nextToken++;
  pendingSaves.set(normalizeVaultPath(path), {
    content,
    token,
  });
  return token;
}

export function clearPendingNoteSave(path: string, token?: number) {
  const normalizedPath = normalizeVaultPath(path);

  if (token !== undefined) {
    const entry = pendingSaves.get(normalizedPath);

    if (entry && entry.token !== token) {
      return;
    }
  }

  pendingSaves.delete(normalizedPath);
}

export function hasPendingNoteSave(path: string) {
  return pendingSaves.has(normalizeVaultPath(path));
}

export function matchesPendingNoteSave(path: string, content: string | null) {
  const entry = pendingSaves.get(normalizeVaultPath(path));

  if (!entry) {
    return false;
  }

  return entry.content === content;
}

export function clearAllPendingNoteSaves() {
  pendingSaves.clear();
}
