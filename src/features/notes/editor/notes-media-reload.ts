let mediaReloadKey = 0;
const listeners = new Set<() => void>();

/**
 * A process-local cache version for vault-backed media. Electron's vault
 * watcher currently reports a coarse "something changed" signal, so every
 * signal advances the version. Consumers append it only to the private
 * shadowing-media protocol; remote URLs remain stable.
 */
export function bumpNotesMediaReloadKey() {
  mediaReloadKey += 1;
  listeners.forEach((listener) => listener());
  return mediaReloadKey;
}

export function getNotesMediaReloadKey() {
  return mediaReloadKey;
}

export function subscribeNotesMediaReloadKey(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetNotesMediaReloadKeyForTests() {
  mediaReloadKey = 0;
  listeners.clear();
}
