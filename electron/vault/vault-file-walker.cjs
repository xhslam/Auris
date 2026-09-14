const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * 以显式待处理栈遍历 Vault，避免把一个大型子树的记录作为
 * `Array.prototype.push(...records)` 的参数展开；后者会在大型目录中触发
 * V8 的调用参数上限，表现为 "Maximum call stack size exceeded"。
 */
function createVaultFileWalker({ readdir = fs.readdir, stat = fs.stat } = {}) {
  return async function walkVaultFiles(vaultPath) {
    const records = [];
    const pendingDirectories = [""];

    while (pendingDirectories.length > 0) {
      const relativeDirectory = pendingDirectories.pop();
      const currentDirectory = path.join(vaultPath, relativeDirectory);
      const entries = await readdir(currentDirectory, { withFileTypes: true });

      for (const entry of entries) {
        if (relativeDirectory === "" && entry.name === ".shadowing") {
          continue;
        }

        const relativePath = relativeDirectory
          ? path.posix.join(relativeDirectory.replace(/\\/g, "/"), entry.name)
          : entry.name;
        const normalizedRelativePath = relativePath.replace(/\\/g, "/");

        if (entry.isDirectory()) {
          records.push({
            absolutePath: path.join(vaultPath, relativePath),
            fileName: entry.name,
            isDirectory: true,
            relativePath: normalizedRelativePath,
          });
          pendingDirectories.push(relativePath);
          continue;
        }

        const absolutePath = path.join(vaultPath, relativePath);
        // Dirent 不携带时间戳；读取文件属性失败时仍保留文件条目，并显式标记为
        // 无可用修改时间，避免单个文件的权限或瞬态问题中断整个 Vault 扫描。
        const metadata = await stat(absolutePath).catch(() => null);

        records.push({
          absolutePath,
          fileName: entry.name,
          mtime: metadata?.mtime instanceof Date ? metadata.mtime.toISOString() : null,
          relativePath: normalizedRelativePath,
        });
      }
    }

    return records.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );
  };
}

const walkVaultFiles = createVaultFileWalker();

module.exports = {
  createVaultFileWalker,
  walkVaultFiles,
};
