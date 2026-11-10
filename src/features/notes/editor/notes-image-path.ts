export function isAbsoluteNotesImagePath(path: string) {
  return /^(?:\/|[a-z]:[\\/])/i.test(path);
}

function canonicalPath(path: string) {
  // macOS file-open events resolve /var's system symlink to /private/var.
  return path.replace(/\\/g, "/").replace(/^\/private\/var\//, "/var/").replace(/\/+$/, "");
}

export function relativeNotesImagePath(notePath: string, vaultPath: string) {
  if (!isAbsoluteNotesImagePath(notePath)) return notePath;
  const note = canonicalPath(notePath);
  const root = canonicalPath(vaultPath);
  if (note.split("/").some(segment => segment === "." || segment === "..")) {
    throw new Error("笔记路径无效，无法保存图片。");
  }
  const windows = /^[a-z]:/i.test(root);
  const prefix = `${root}/`;
  if (!(windows ? note.toLowerCase().startsWith(prefix.toLowerCase()) : note.startsWith(prefix))) {
    throw new Error("请先将笔记放入当前工作区，再插入图片。");
  }
  return note.slice(prefix.length);
}

export async function resolveNotesImagePath(notePath: string) {
  if (!isAbsoluteNotesImagePath(notePath)) return notePath;
  const info = await window.shadowingDesktop?.vault?.getDirectoryInfo();
  if (!info?.vaultPath) throw new Error("请先连接笔记工作区，再插入图片。");
  return relativeNotesImagePath(notePath, info.vaultPath);
}
