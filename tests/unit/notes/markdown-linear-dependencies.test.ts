import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Root } from "mdast";
import { describe, expect, it } from "vitest";
import reference from "../../fixtures/notes/mdast-list-reference.json";
const require = createRequire(import.meta.url);
const { verifyMarkdownPatches } = require("../../../scripts/verify-markdown-patches.cjs");
const syntax = unified().use(remarkGfm, { singleTilde: false }).use(remarkMath).freeze().data();
describe("Markdown dependency invariants", () => {
  it("requires exact patched bytes and versions, including the production and development files", () => {
    expect(verifyMarkdownPatches()).toBe(true);
  });
  it("fails the build gate if an installed production file loses its patch", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "auris-markdown-gate-"));
    const contract = JSON.parse(readFileSync("scripts/markdown-patch-contract.json", "utf8"));
    try {
      for (const [name, version] of Object.entries(contract.versions)) {
        const target = path.join(directory, "node_modules", name);
        mkdirSync(target, { recursive: true });
        writeFileSync(path.join(target, "package.json"), JSON.stringify({ version }));
      }
      for (const file of Object.keys(contract.files)) {
        const target = path.join(directory, "node_modules", file);
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(path.join("node_modules", file), target);
      }
      expect(verifyMarkdownPatches(directory)).toBe(true);
      writeFileSync(path.join(directory, "node_modules/mdast-util-from-markdown/lib/index.js"), "unpatched");
      expect(() => verifyMarkdownPatches(directory)).toThrow("Markdown patch missing or changed");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it.each(["lib/index.js", "dev/lib/index.js"])("preserves 197 pristine list ASTs including positions and spread: %s", async (entry) => {
    const url = pathToFileURL(path.resolve("node_modules/mdast-util-from-markdown", entry)).href;
    const { fromMarkdown } = await import(/* @vite-ignore */ url);
    for (const example of reference.examples) {
      const tree = fromMarkdown(example.markdown, { extensions: syntax.micromarkExtensions, mdastExtensions: syntax.fromMarkdownExtensions });
      const digest = createHash("sha256").update(JSON.stringify(tree)).digest("hex");
      expect(digest, example.name).toBe(example.sha256);
    }
  });
  it("removes repeated sibling indexOf scans on wide unmatched text", () => {
    const children = Array.from({ length: 5000 }, (_, i) => ({ type: "text" as const, value: `plain${i}` }));
    let lookups = 0;
    Object.defineProperty(children, "indexOf", { value: () => { lookups++; throw new Error("Repeated sibling scan"); } });
    const tree: Root = { type: "root", children: [{ type: "paragraph", children }] };
    findAndReplace(tree, [/never-matches/g, "replacement"], { ignore: ["link", "linkReference"] });
    expect(lookups).toBe(0);
    expect(children[4999].value).toBe("plain4999");
  });
  it("keeps index-sensitive ignore callbacks and aliased replacement nodes exact", () => {
    const first = { type: "text" as const, value: "a" };
    const second = { type: "text" as const, value: "b" };
    const tree: Root = { type: "root", children: [{ type: "paragraph", children: [first, second] }] };
    const indices: Array<number | undefined> = [];
    findAndReplace(tree, [/a/g, () => { first.value = "A"; return first; }], { ignore: (node, index) => { if (node.type === "paragraph") indices.push(index); return false; } });
    expect(indices.every((index) => index === 0)).toBe(true);
    expect(tree.children[0]).toMatchObject({ children: [{ value: "A" }, { value: "b" }] });
  });
  it("pins the independent pristine reference identity", () => {
    expect(reference.sourceSha256).toBe("2b19a9873232679ef08429e08c5836c865a54d8113ae5d58cb9409a60863727b");
    expect(readFileSync("patches/mdast-util-from-markdown+2.0.3.patch", "utf8")).toContain("insertListItems");
  });
});
