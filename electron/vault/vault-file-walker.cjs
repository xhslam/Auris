const fs = require("node:fs/promises");
const path = require("node:path");
const { isIgnoredVaultRootDirectory } = require("./vault-ignore-rules.cjs");

const DEFAULT_STAT_CONCURRENCY = 8;

function joinVaultPath(basePath, subPath) {
  if (!subPath) {
    return basePath;
  }

  // Preserve POSIX separator in tests or environments where basePath is POSIX
  if (basePath.startsWith("/") && !basePath.includes("\\")) {
    return path.posix.join(basePath, subPath.replace(/\\/g, "/"));
  }

  return path.join(basePath, subPath);
}

async function mapWithLimit(items, limit, fn) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * 以显式待处理栈遍历 Vault，避免把大型子树的记录作为
 * `Array.prototype.push(...records)` 的参数展开（避免超出调用栈限制）。
 * 忽略根级点目录与指定隐藏目录，stat() 使用有界并发（默认 8）。
 */
const pathCollator = new Intl.Collator();

function createVaultFileWalker({
  readdir = fs.readdir,
  stat = fs.stat,
  statConcurrency = DEFAULT_STAT_CONCURRENCY,
} = {}) {
  return async function walkVaultFiles(vaultPath, options = {}) {
    const isNamesOnly = options.namesOnly === true || options.mode === "names-only";
    const records = [];
    const pendingDirectories = [""];

    while (pendingDirectories.length > 0) {
      const relativeDirectory = pendingDirectories.pop();
      const currentDirectory = joinVaultPath(vaultPath, relativeDirectory);
      const entries = await readdir(currentDirectory, { withFileTypes: true });

      const filesInDirectory = [];

      for (const entry of entries) {
        if (
          relativeDirectory === "" &&
          entry.isDirectory() &&
          isIgnoredVaultRootDirectory(entry.name)
        ) {
          continue;
        }

        const relativePath = relativeDirectory
          ? path.posix.join(relativeDirectory.replace(/\\/g, "/"), entry.name)
          : entry.name;
        const normalizedRelativePath = relativePath.replace(/\\/g, "/");

        if (entry.isDirectory()) {
          records.push({
            absolutePath: joinVaultPath(vaultPath, relativePath),
            fileName: entry.name,
            isDirectory: true,
            relativePath: normalizedRelativePath,
          });
          pendingDirectories.push(relativePath);
        } else {
          filesInDirectory.push({
            entry,
            normalizedRelativePath,
            relativePath,
          });
        }
      }

      if (filesInDirectory.length > 0) {
        if (isNamesOnly) {
          for (let i = 0; i < filesInDirectory.length; i++) {
            const { entry, normalizedRelativePath, relativePath } = filesInDirectory[i];
            records.push({
              absolutePath: joinVaultPath(vaultPath, relativePath),
              fileName: entry.name,
              mtime: null,
              relativePath: normalizedRelativePath,
              size: null,
            });
          }
        } else {
          const fileRecords = await mapWithLimit(
            filesInDirectory,
            statConcurrency,
            async ({ entry, normalizedRelativePath, relativePath }) => {
              const absolutePath = joinVaultPath(vaultPath, relativePath);
              const metadata = await stat(absolutePath).catch(() => null);

              return {
                absolutePath,
                fileName: entry.name,
                mtime:
                  metadata?.mtime instanceof Date
                    ? metadata.mtime.toISOString()
                    : null,
                relativePath: normalizedRelativePath,
                size: typeof metadata?.size === "number" ? metadata.size : null,
              };
            },
          );

          for (let i = 0; i < fileRecords.length; i++) {
            records.push(fileRecords[i]);
          }
        }
      }
    }

    return records.sort((left, right) =>
      pathCollator.compare(left.relativePath, right.relativePath),
    );
  };
}

const walkVaultFiles = createVaultFileWalker();

module.exports = {
  createVaultFileWalker,
  walkVaultFiles,
};
