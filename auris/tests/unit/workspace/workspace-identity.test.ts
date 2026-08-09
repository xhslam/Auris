/**
 * 工作区身份 / 路径归一 / rail 字形。
 *
 * 覆盖点对齐 vmark 的三份测试（workspaceIdentity / workspaceIdentityPaths /
 * workspaceRailGlyphs），保留它们记录过的边缘情况：POSIX 路径的首尾空格不能
 * trim、Windows 盘符大小写与 UNC 前缀、字形不能切在 grapheme 内部。
 */

import { describe, expect, it } from "vitest";
import {
  createWorkspaceInstance,
  createWorkspaceRootIdentity,
  disambiguateWorkspaceDisplayNames,
} from "@/features/notes/workspace/workspace-identity";
import {
  deriveWorkspaceDisplayName,
  normalizeWorkspacePathForIdentity,
} from "@/features/notes/workspace/workspace-identity-paths";
import { workspaceRailGlyphs } from "@/features/notes/workspace/workspace-rail-glyphs";

describe("normalizeWorkspacePathForIdentity", () => {
  it("collapses repeated POSIX separators", () => {
    expect(normalizeWorkspacePathForIdentity("/Users//me///Notes", "macos").normalizedPath).toBe(
      "/Users/me/Notes",
    );
  });

  it("strips a trailing separator but keeps the root itself", () => {
    expect(normalizeWorkspacePathForIdentity("/Users/me/Notes/", "macos").normalizedPath).toBe(
      "/Users/me/Notes",
    );
    expect(normalizeWorkspacePathForIdentity("/", "macos").normalizedPath).toBe("/");
  });

  it("keeps surrounding spaces so two distinct POSIX paths stay distinct", () => {
    // vmark 在这里留了注释：POSIX 路径段合法地可以带首尾空格，trim 会把两个
    // 不同的工作区折叠成同一个身份。
    const bare = normalizeWorkspacePathForIdentity("/Users/me/Repo", "macos");
    const spaced = normalizeWorkspacePathForIdentity("/Users/me/Repo ", "macos");

    expect(bare.platformIdentity).not.toBe(spaced.platformIdentity);
  });

  it("is case-sensitive on POSIX", () => {
    expect(normalizeWorkspacePathForIdentity("/Users/Me", "macos").platformIdentity).not.toBe(
      normalizeWorkspacePathForIdentity("/users/me", "macos").platformIdentity,
    );
  });

  it("normalizes Windows separators, drive case, and folds identity case", () => {
    const forward = normalizeWorkspacePathForIdentity("c:/Users/me/Notes", "windows");

    expect(forward.normalizedPath).toBe("C:\\Users\\me\\Notes");
    expect(forward.platformIdentity).toBe("c:\\users\\me\\notes");
  });

  it("preserves the UNC double-backslash prefix", () => {
    expect(
      normalizeWorkspacePathForIdentity("//server/share/notes", "windows").normalizedPath,
    ).toBe("\\\\server\\share\\notes");
  });

  it("keeps a bare Windows drive as a rooted path", () => {
    expect(normalizeWorkspacePathForIdentity("C:", "windows").normalizedPath).toBe("C:\\");
    expect(normalizeWorkspacePathForIdentity("c:\\", "windows").normalizedPath).toBe("C:\\");
  });
});

describe("deriveWorkspaceDisplayName", () => {
  it("uses the last POSIX segment", () => {
    expect(deriveWorkspaceDisplayName("/Users/me/Notes", "macos")).toBe("Notes");
  });

  it("returns the root itself when there is no segment", () => {
    expect(deriveWorkspaceDisplayName("/", "macos")).toBe("/");
    expect(deriveWorkspaceDisplayName("C:\\", "windows")).toBe("C:\\");
  });

  it("uses the last Windows segment", () => {
    expect(deriveWorkspaceDisplayName("C:\\Users\\me\\Notes", "windows")).toBe("Notes");
  });
});

describe("createWorkspaceRootIdentity", () => {
  it("rejects an empty root path instead of inventing an identity", () => {
    expect(createWorkspaceRootIdentity("")).toEqual({ error: "emptyRootPath", ok: false });
    expect(createWorkspaceRootIdentity("   ")).toEqual({ error: "emptyRootPath", ok: false });
    expect(createWorkspaceRootIdentity(null)).toEqual({ error: "emptyRootPath", ok: false });
  });

  it("derives rootId from the platform identity, not the display path", () => {
    const result = createWorkspaceRootIdentity("/Users/me/Notes/", { platform: "macos" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.rootId).toBe("path:macos:/Users/me/Notes");
    expect(result.root.rootPath).toBe("/Users/me/Notes");
    expect(result.root.displayName).toBe("Notes");
    expect(result.root.canonicalization).toBe("fallback");
  });

  it("uses the canonical path for identity while keeping the requested path for display", () => {
    // 这正是 symlink 的情形：两条不同的请求路径指向同一个真实目录，身份必须合一。
    const viaLink = createWorkspaceRootIdentity("/Users/me/link", {
      canonicalPath: "/Volumes/Data/Notes",
      platform: "macos",
    });
    const direct = createWorkspaceRootIdentity("/Volumes/Data/Notes", {
      canonicalPath: "/Volumes/Data/Notes",
      platform: "macos",
    });

    expect(viaLink.ok && direct.ok).toBe(true);
    if (!viaLink.ok || !direct.ok) return;
    expect(viaLink.root.rootId).toBe(direct.root.rootId);
    expect(viaLink.root.rootPath).toBe("/Users/me/link");
    expect(viaLink.root.canonicalization).toBe("canonical");
  });

  it("treats a blank canonical path as absent rather than as an identity", () => {
    const result = createWorkspaceRootIdentity("/Users/me/Notes", {
      canonicalPath: "   ",
      platform: "macos",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.canonicalization).toBe("fallback");
    expect(result.root.rootId).toBe("path:macos:/Users/me/Notes");
  });
});

describe("createWorkspaceInstance", () => {
  const root = (path: string) => {
    const result = createWorkspaceRootIdentity(path, { platform: "macos" });
    if (!result.ok) throw new Error("fixture root must resolve");
    return result.root;
  };

  it("builds a workspace instance from a root", () => {
    const instance = createWorkspaceInstance({
      createdFrom: "open",
      root: root("/Users/me/Notes"),
      workspaceInstanceId: "wsi-1",
    });

    expect(instance.kind).toBe("workspace");
    expect(instance.displayName).toBe("Notes");
    expect(instance.rootPath).toBe("/Users/me/Notes");
    // 真实工作区没有文案 key：它的名字是真的路径派生名。
    expect(instance.displayNameKey).toBeUndefined();
  });

  it("gives synthetic instances a translation key instead of a stored English name", () => {
    const loose = createWorkspaceInstance({
      createdFrom: "open",
      root: null,
      workspaceInstanceId: "wsi-loose",
    });
    const placeholder = createWorkspaceInstance({
      createdFrom: "placeholder",
      root: null,
      workspaceInstanceId: "wsi-placeholder",
    });

    expect(loose.kind).toBe("loose");
    expect(loose.displayNameKey).toBe("workspaceRail.looseFiles");
    expect(placeholder.kind).toBe("placeholder");
    expect(placeholder.displayNameKey).toBe("workspaceRail.untitled");
  });

  it("fails loud on a contradictory kind/root combination", () => {
    expect(() =>
      createWorkspaceInstance({
        createdFrom: "open",
        kind: "workspace",
        root: null,
        workspaceInstanceId: "wsi-bad",
      }),
    ).toThrow(/requires a root/);

    expect(() =>
      createWorkspaceInstance({
        createdFrom: "open",
        kind: "loose",
        root: root("/Users/me/Notes"),
        workspaceInstanceId: "wsi-bad",
      }),
    ).toThrow(/must not have a root/);
  });

  it("omits unavailableRoot rather than writing it as undefined", () => {
    const instance = createWorkspaceInstance({
      createdFrom: "open",
      root: root("/Users/me/Notes"),
      workspaceInstanceId: "wsi-1",
    });

    expect("unavailableRoot" in instance).toBe(false);
  });
});

describe("disambiguateWorkspaceDisplayNames", () => {
  it("leaves unique names untouched", () => {
    const labels = disambiguateWorkspaceDisplayNames([
      { displayName: "Notes", rootId: "a", workspaceInstanceId: "1" },
      { displayName: "Journal", rootId: "b", workspaceInstanceId: "2" },
    ]);

    expect(labels).toEqual({ "1": "Notes", "2": "Journal" });
  });

  it("numbers duplicates from the second occurrence", () => {
    const labels = disambiguateWorkspaceDisplayNames([
      { displayName: "Notes", rootId: "a", workspaceInstanceId: "1" },
      { displayName: "Notes", rootId: "b", workspaceInstanceId: "2" },
      { displayName: "Notes", rootId: "c", workspaceInstanceId: "3" },
    ]);

    expect(labels).toEqual({ "1": "Notes", "2": "Notes 2", "3": "Notes 3" });
  });
});

describe("workspaceRailGlyphs", () => {
  const glyph = (displayName: string, kind = "workspace") =>
    workspaceRailGlyphs([{ displayName, kind, workspaceInstanceId: "x" }]).x;

  it("uses the first character, uppercased", () => {
    expect(glyph("notes")).toBe("N");
  });

  it("skips leading punctuation so a dotfile root is still identifiable", () => {
    expect(glyph(".config")).toBe("C");
  });

  it("keeps an emoji as the glyph rather than skipping to a letter", () => {
    // vmark 记录过这个判断：emoji 往往是名字里最好认的字符，跳过它去取 "P"
    // 反而丢掉了识别度。
    expect(glyph("🚀 project")).toBe("🚀");
  });

  it("does not split inside a grapheme cluster", () => {
    // ZWJ 家庭 emoji：按 code point 切会得到 "👨"，那是名字里没有的字符。
    expect(glyph("👨‍👩‍👧 family")).toBe("👨‍👩‍👧");
    // 肤色修饰符不能和基字符分离。
    expect(glyph("👍🏽 ok")).toBe("👍🏽");
  });

  it("keeps a decomposed accent attached to its base letter", () => {
    const decomposed = "e\u0301tude";

    expect(glyph(decomposed)).toBe("E\u0301");
  });

  it("handles CJK names", () => {
    expect(glyph("笔记")).toBe("笔");
  });

  it("falls back when a name yields no usable character", () => {
    expect(glyph("")).toBe("?");
    expect(glyph("   ")).toBe("?");
    expect(glyph("...")).toBe("?");
  });

  it("lets colliding names share a letter instead of growing the glyph", () => {
    // vmark 明确记录过这个取舍：30px 的 rail 要缩放 2–3 字符的字形才能放下，
    // 为了买一个 rail 不需要的唯一性，反而让碰撞的条目更难认。
    const glyphs = workspaceRailGlyphs([
      { displayName: "alpha", kind: "workspace", workspaceInstanceId: "1" },
      { displayName: "apex", kind: "workspace", workspaceInstanceId: "2" },
    ]);

    expect(glyphs).toEqual({ "1": "A", "2": "A" });
  });

  it("gives loose instances no glyph, since they are not workspaces", () => {
    const glyphs = workspaceRailGlyphs([
      { displayName: "Loose Files", kind: "loose", workspaceInstanceId: "1" },
      { displayName: "Notes", kind: "workspace", workspaceInstanceId: "2" },
    ]);

    expect(glyphs).toEqual({ "2": "N" });
  });
});
