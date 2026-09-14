/**
 * 已知 vault 根的归一化与授权判定。
 *
 * 抽成独立模块只有一个理由：这里是 Workspace Rail 引入的**唯一安全边界**，
 * 而它原本埋在 main.cjs（4000+ 行、与 Electron 强耦合）里，测不到。安全判定
 * 不能只靠注释声明正确。
 *
 * 背景：rail 需要「不弹对话框就换 vault 根」。但 vault 根一旦可以由 renderer
 * 任意指定，`vault:read-file` / `vault:list-files` 就成了任意目录读取通道——
 * 把根指到 `~/.ssh`，再逐个文件读出来。一个受限的笔记读写接口就此升级成任意
 * 文件读取。
 *
 * 因此约束是：**换根只能在用户此前通过原生目录选择器亲自授权过的根之间进行**。
 * 新根必须走 `pick-directory`（系统对话框，用户在 OS 层面做出选择）。
 *
 * 纯函数：不碰 fs、不碰 Electron，所以每条判定都能直接单测。
 *
 * @module electron/vault/vault-roots
 */

"use strict";

const path = require("node:path");

/** 已知根列表上限：够覆盖真实使用，又不让配置无限膨胀。 */
const MAX_KNOWN_VAULT_ROOTS = 24;

const AUTHORIZATION_ERRORS = Object.freeze({
  EMPTY: "EMPTY_ROOT_PATH",
  NOT_ABSOLUTE: "ROOT_NOT_ABSOLUTE",
  NOT_AUTHORIZED: "ROOT_NOT_AUTHORIZED",
});

/**
 * 归一化持久化下来的已知根列表。
 *
 * 丢掉非字符串、空串和相对路径，并按 `path.resolve` 去重。相对路径必须丢：
 * 它会在 `path.resolve` 时被拼到进程 cwd 上，等于让配置文件里的一个 `".."`
 * 变成一个跟 cwd 有关的、用户从没授权过的目录。
 */
function normalizeKnownVaultRoots(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const roots = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || !path.isAbsolute(trimmed)) continue;
    const normalized = path.resolve(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    roots.push(normalized);
    if (roots.length >= MAX_KNOWN_VAULT_ROOTS) break;
  }

  return roots;
}

/**
 * 把一个已授权的根记进列表头部（最近使用优先），并保持去重与上限。
 */
function rememberVaultRoot(knownRoots, rootPath) {
  const normalized = path.resolve(rootPath);
  const remaining = normalizeKnownVaultRoots(knownRoots).filter(
    (entry) => entry !== normalized,
  );
  return [normalized, ...remaining].slice(0, MAX_KNOWN_VAULT_ROOTS);
}

/**
 * 判定一次换根请求是否被授权。
 *
 * 返回结构化结果而不是抛异常，让调用方把「未授权」和「暂时不可达」区分开：
 * 前者要引导用户走选择器，后者要在 rail 上标成不可用。把两者混成一个错误，
 * 用户会以为笔记目录丢了。
 *
 * 注意这里**不**做存在性检查——那需要 fs，会让这个模块不可纯测。可达性由调用
 * 方在拿到 `ok: true` 之后单独检查。
 */
function authorizeVaultRoot(knownRoots, requestedPath) {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) {
    return { code: AUTHORIZATION_ERRORS.EMPTY, ok: false };
  }

  const trimmed = requestedPath.trim();

  // 相对路径直接拒绝，不做 resolve。否则 `"."` 会解析成进程 cwd，`".."` 解析
  // 成它的父目录——两者都可能恰好落在某个已授权根上，从而让一个从未被授权的
  // 输入形式通过白名单。
  if (!path.isAbsolute(trimmed)) {
    return { code: AUTHORIZATION_ERRORS.NOT_ABSOLUTE, ok: false };
  }

  const normalized = path.resolve(trimmed);

  if (!normalizeKnownVaultRoots(knownRoots).includes(normalized)) {
    return { code: AUTHORIZATION_ERRORS.NOT_AUTHORIZED, ok: false };
  }

  return { ok: true, rootPath: normalized };
}

module.exports = {
  AUTHORIZATION_ERRORS,
  MAX_KNOWN_VAULT_ROOTS,
  authorizeVaultRoot,
  normalizeKnownVaultRoots,
  rememberVaultRoot,
};
