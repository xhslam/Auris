// Root-level directory ignore rules for Electron Vault File Walker.
// Matches the semantics in src/features/notes/vault/vault-path.ts (isHiddenVaultPath).

const HIDDEN_ROOT_NAMES = new Set(["视频区"]);

function isIgnoredVaultRootDirectory(name) {
  if (!name) return false;
  return name.startsWith(".") || HIDDEN_ROOT_NAMES.has(name);
}

module.exports = {
  HIDDEN_ROOT_NAMES,
  isIgnoredVaultRootDirectory,
};
