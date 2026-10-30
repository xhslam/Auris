import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { createTerminalProjectDirectories } = require("../../../electron/terminal-project-directories.cjs");
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "auris-terminal-projects-")); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function project(name: string) { const p = path.join(root, name); fs.mkdirSync(p); return fs.realpathSync(p); }
function store() { return createTerminalProjectDirectories(path.join(root, "state/projects.json")); }

describe("terminal project directory grants", () => {
  it("starts empty; never authorizes an arbitrary existing directory", () => {
    const p = project("outside-vault");
    expect(store().list()).toEqual([]);
    expect(() => store().resolve(p)).toThrow("尚未授权");
    expect(() => store().resolve("relative")).toThrow("选择文件夹");
  });
  it("persists native selection and restores it without touching a Notes Vault", () => {
    const p = project("中文 项目");
    expect(store().grantSelectedDirectory(p)).toEqual({ path: p, name: "中文 项目", available: true });
    expect(store().resolve(p)).toBe(p);
    expect(store().list()).toHaveLength(1);
    expect(fs.existsSync(path.join(root, "state/shadowing-desktop-config.json"))).toBe(false);
  });
  it("deduplicates and orders recent projects by actual use", () => {
    const a = project("a"), b = project("b");
    const s = store(); s.grantSelectedDirectory(a); s.grantSelectedDirectory(b); s.grantSelectedDirectory(a);
    expect(s.list().map((p: { path: string }) => p.path)).toEqual([a, b]);
    s.touch(b);
    expect(s.list().map((p: { path: string }) => p.path)).toEqual([b, a]);
  });
  it("rejects a file and an absent path rather than falling back to another project", () => {
    const file = path.join(root, "file"); fs.writeFileSync(file, "test");
    expect(() => store().grantSelectedDirectory(file)).toThrow("不是文件夹");
    expect(() => store().grantSelectedDirectory(path.join(root, "missing"))).toThrow();
    expect(store().list()).toEqual([]);
  });
  it("marks deleted projects unavailable and refuses to launch them", () => {
    const p = project("deleted"); const s = store(); s.grantSelectedDirectory(p); fs.rmdirSync(p);
    expect(s.list()[0].available).toBe(false);
    expect(() => s.resolve(p)).toThrow("已失效");
  });
  it("rejects a directory replaced by a symlink to a different project", () => {
    const a = project("a"), b = project("b"); const s = store(); s.grantSelectedDirectory(a);
    fs.rmdirSync(a); fs.symlinkSync(b, a, "dir");
    expect(s.list()[0].available).toBe(false);
    expect(() => s.resolve(a)).toThrow("目标发生变化");
  });
  it("canonicalizes an explicitly selected symlink but does not authorize its siblings or traversal targets", () => {
    const p = project("actual"), sibling = project("sibling"); const link = path.join(root, "link"); fs.symlinkSync(p, link, "dir");
    const s = store(); expect(s.grantSelectedDirectory(link).path).toBe(p);
    expect(s.resolve(p)).toBe(p);
    expect(() => s.resolve(sibling)).toThrow("尚未授权");
    expect(() => s.resolve(path.join(p, "..", "sibling"))).toThrow("尚未授权");
  });
  it("shows twelve recents without revoking older selected projects needed for session recovery", () => {
    const s = store(); const first = project("first"); s.grantSelectedDirectory(first);
    for (let i = 0; i < 13; i++) s.grantSelectedDirectory(project(String(i)));
    expect(s.list()).toHaveLength(12); expect(s.resolve(first)).toBe(first);
  });
  it("does not trim valid spaces from selected paths", () => {
    const p = project("with trailing space "); const s = store(); s.grantSelectedDirectory(p);
    expect(s.resolve(p)).toBe(p);
  });
});
