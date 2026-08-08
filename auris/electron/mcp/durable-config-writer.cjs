const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const CONFIG_CONFLICT_CODE = "AURIS_CONFIG_CONFLICT";

function configConflict() {
  const error = new Error("The MCP client configuration changed during installation.");
  error.code = CONFIG_CONFLICT_CODE;
  return error;
}

async function readFileOrNull(fileSystem = fs, filePath) {
  try {
    return await fileSystem.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function syncDirectory(fileSystem, directoryPath) {
  let handle;
  try {
    handle = await fileSystem.open(directoryPath, "r");
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(error?.code)) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function writeExclusiveFile(fileSystem, filePath, content, mode = 0o600) {
  const handle = await fileSystem.open(filePath, "wx", mode);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function uniqueSibling(filePath, suffix, randomId) {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomId()}.${suffix}`,
  );
}

async function createBackup({
  expectedContent,
  fileSystem,
  randomId,
  targetPath,
}) {
  if (expectedContent === null) return null;
  const backupPath = uniqueSibling(targetPath, "auris-backup", randomId);
  await writeExclusiveFile(fileSystem, backupPath, expectedContent);
  await fileSystem.chmod(backupPath, 0o600).catch((error) => {
    if (error?.code !== "ENOSYS") throw error;
  });
  return backupPath;
}

async function durableCompareAndSwapWrite({
  beforeCommit,
  expectedContent,
  fileSystem = fs,
  nextContent,
  randomId = () => crypto.randomUUID(),
  targetPath,
}) {
  const directoryPath = path.dirname(targetPath);
  const directoryExisted = await fileSystem
    .stat(directoryPath)
    .then(() => true)
    .catch((error) => {
      if (error?.code === "ENOENT") return false;
      throw error;
    });
  await fileSystem.mkdir(directoryPath, { mode: 0o700, recursive: true });
  if (!directoryExisted) {
    await fileSystem.chmod(directoryPath, 0o700).catch((error) => {
      if (!["ENOSYS", "EPERM"].includes(error?.code)) throw error;
    });
  }

  if ((await readFileOrNull(fileSystem, targetPath)) !== expectedContent) {
    throw configConflict();
  }

  const temporaryPath = uniqueSibling(targetPath, "tmp", randomId);
  let backupPath = null;
  try {
    await writeExclusiveFile(fileSystem, temporaryPath, nextContent);
    if (typeof beforeCommit === "function") {
      await beforeCommit({ expectedContent, nextContent, targetPath });
    }
    if ((await readFileOrNull(fileSystem, targetPath)) !== expectedContent) {
      throw configConflict();
    }

    backupPath = await createBackup({
      expectedContent,
      fileSystem,
      randomId,
      targetPath,
    });
    if ((await readFileOrNull(fileSystem, targetPath)) !== expectedContent) {
      throw configConflict();
    }

    if (expectedContent === null) {
      try {
        await fileSystem.link(temporaryPath, targetPath);
      } catch (error) {
        if (error?.code === "EEXIST") throw configConflict();
        throw error;
      }
      await fileSystem.unlink(temporaryPath);
    } else {
      await fileSystem.rename(temporaryPath, targetPath);
    }
    await fileSystem.chmod(targetPath, 0o600).catch((error) => {
      if (!["ENOSYS", "EPERM"].includes(error?.code)) throw error;
    });
    await syncDirectory(fileSystem, directoryPath);
    return { backupPath };
  } finally {
    await fileSystem.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

module.exports = {
  CONFIG_CONFLICT_CODE,
  durableCompareAndSwapWrite,
  readFileOrNull,
};
