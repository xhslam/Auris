/**
 * 已知 vault 根的授权判定。
 *
 * 这是 Workspace Rail 引入的唯一安全边界：换根不弹对话框，所以必须保证只有
 * 用户此前亲自通过原生选择器授权过的根才能被切过去。绕过它等于把受限的笔记
 * 读写接口升级成任意目录读取（把根指到 `~/.ssh` 再逐个文件读）。
 *
 * 所以这些用例的重点不是"函数能跑"，而是几条具体的绕过手法都被挡住：相对
 * 路径、`..` 逃逸、尾斜杠/重复斜杠的形状差异、以及配置文件里被塞进相对路径。
 */

import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  AUTHORIZATION_ERRORS,
  MAX_KNOWN_VAULT_ROOTS,
  authorizeVaultRoot,
  normalizeKnownVaultRoots,
  rememberVaultRoot,
} = require("../../../electron/vault/vault-roots.cjs");

// 用 path.resolve 构造期望值，让用例在 POSIX 与 Windows 上都成立。
const VAULT_A = path.resolve("/vaults/alpha");
const VAULT_B = path.resolve("/vaults/beta");

describe("normalizeKnownVaultRoots", () => {
  it("returns an empty list for anything that is not an array", () => {
    expect(normalizeKnownVaultRoots(null)).toEqual([]);
    expect(normalizeKnownVaultRoots(undefined)).toEqual([]);
    expect(normalizeKnownVaultRoots("/vaults/alpha")).toEqual([]);
    expect(normalizeKnownVaultRoots({ 0: "/vaults/alpha" })).toEqual([]);
  });

  it("drops non-string and blank entries", () => {
    expect(
      normalizeKnownVaultRoots([VAULT_A, 42, null, "", "   ", VAULT_B]),
    ).toEqual([VAULT_A, VAULT_B]);
  });

  it("drops relative paths so a config entry cannot resolve against cwd", () => {
    // 这条是安全性的一半：如果保留相对路径并 resolve，配置文件里的 ".." 就会
    // 变成一个跟进程 cwd 有关、用户从没授权过的目录，然后它会出现在白名单里。
    expect(
      normalizeKnownVaultRoots(["notes", "./notes", "../notes", VAULT_A]),
    ).toEqual([VAULT_A]);
  });

  it("de-duplicates paths that differ only in shape", () => {
    expect(
      normalizeKnownVaultRoots([
        VAULT_A,
        `${VAULT_A}${path.sep}`,
        VAULT_A.replace(path.sep, `${path.sep}${path.sep}`),
      ]),
    ).toEqual([VAULT_A]);
  });

  it("caps the list so the config cannot grow without bound", () => {
    const many = Array.from({ length: MAX_KNOWN_VAULT_ROOTS + 10 }, (_, index) =>
      path.resolve(`/vaults/v${index}`),
    );

    expect(normalizeKnownVaultRoots(many)).toHaveLength(MAX_KNOWN_VAULT_ROOTS);
  });
});

describe("rememberVaultRoot", () => {
  it("puts the newest root first", () => {
    expect(rememberVaultRoot([VAULT_A], VAULT_B)).toEqual([VAULT_B, VAULT_A]);
  });

  it("moves an existing root to the front instead of duplicating it", () => {
    expect(rememberVaultRoot([VAULT_A, VAULT_B], VAULT_A)).toEqual([
      VAULT_A,
      VAULT_B,
    ]);
  });

  it("normalizes the incoming path before comparing", () => {
    expect(rememberVaultRoot([VAULT_A], `${VAULT_A}${path.sep}`)).toEqual([
      VAULT_A,
    ]);
  });

  it("evicts the oldest root once the cap is reached", () => {
    const full = Array.from({ length: MAX_KNOWN_VAULT_ROOTS }, (_, index) =>
      path.resolve(`/vaults/v${index}`),
    );
    const next = rememberVaultRoot(full, VAULT_A);

    expect(next).toHaveLength(MAX_KNOWN_VAULT_ROOTS);
    expect(next[0]).toBe(VAULT_A);
    expect(next).not.toContain(full.at(-1));
  });
});

describe("authorizeVaultRoot", () => {
  it("authorizes a root that is already on the list", () => {
    expect(authorizeVaultRoot([VAULT_A, VAULT_B], VAULT_A)).toEqual({
      ok: true,
      rootPath: VAULT_A,
    });
  });

  it("accepts a differently shaped spelling of an authorized root", () => {
    // 尾斜杠只是形状差异，不是另一个目录——拒绝它只会让 rail 无谓地失败。
    expect(authorizeVaultRoot([VAULT_A], `${VAULT_A}${path.sep}`)).toEqual({
      ok: true,
      rootPath: VAULT_A,
    });
  });

  it("refuses a root that was never authorized", () => {
    expect(authorizeVaultRoot([VAULT_A], VAULT_B)).toEqual({
      code: AUTHORIZATION_ERRORS.NOT_AUTHORIZED,
      ok: false,
    });
  });

  it("refuses an empty or blank request", () => {
    for (const value of ["", "   ", null, undefined, 42, {}]) {
      expect(authorizeVaultRoot([VAULT_A], value)).toEqual({
        code: AUTHORIZATION_ERRORS.EMPTY,
        ok: false,
      });
    }
  });

  it("refuses relative paths rather than resolving them against cwd", () => {
    // 这是另一半：`"."` 会 resolve 成进程 cwd、`".."` 成它的父目录。两者都可能
    // 恰好等于某个已授权根，从而让一个从未被授权的输入形式通过白名单。
    for (const value of [".", "..", "notes", "./notes", "../../etc"]) {
      expect(authorizeVaultRoot([VAULT_A, process.cwd()], value)).toEqual({
        code: AUTHORIZATION_ERRORS.NOT_ABSOLUTE,
        ok: false,
      });
    }
  });

  it("refuses a traversal that escapes an authorized root", () => {
    // `/vaults/alpha/../../etc` 归一到 `/etc`，不在白名单里 → 必须拒绝。
    const escape = path.join(VAULT_A, "..", "..", "etc");

    expect(authorizeVaultRoot([VAULT_A], escape)).toEqual({
      code: AUTHORIZATION_ERRORS.NOT_AUTHORIZED,
      ok: false,
    });
  });

  it("refuses a child of an authorized root", () => {
    // 白名单是「根」的名单，不是前缀匹配。子目录没被单独授权就不该通过——
    // 否则 rail 可以把根收窄到任意子树，绕过用户当初选择的范围。
    expect(authorizeVaultRoot([VAULT_A], path.join(VAULT_A, "sub"))).toEqual({
      code: AUTHORIZATION_ERRORS.NOT_AUTHORIZED,
      ok: false,
    });
  });

  it("refuses everything when the known list is empty or malformed", () => {
    expect(authorizeVaultRoot([], VAULT_A)).toEqual({
      code: AUTHORIZATION_ERRORS.NOT_AUTHORIZED,
      ok: false,
    });
    // 白名单本身被污染成相对路径时，它会先被 normalize 丢掉，所以仍然拒绝。
    expect(authorizeVaultRoot(["vaults/alpha"], VAULT_A)).toEqual({
      code: AUTHORIZATION_ERRORS.NOT_AUTHORIZED,
      ok: false,
    });
  });

  it("does not check reachability, which is the caller's job", () => {
    // 纯函数不碰 fs：一个已授权但当前不可达的根仍然返回 ok，由调用方单独检查
    // 存在性并把它标成「不可用」——这两种失败对用户的含义完全不同。
    const authorized = authorizeVaultRoot([VAULT_A], VAULT_A);

    expect(authorized.ok).toBe(true);
  });
});
