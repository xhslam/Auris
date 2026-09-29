#!/usr/bin/env node
/**
 * Packages whose runtime objects cross editor module boundaries must have one
 * installed copy. npm lockfile paths expose copies even when versions match.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SINGLETON_PACKAGES = Object.freeze([
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
  "@codemirror/language",
  "@codemirror/state",
  "@codemirror/view",
  "prosemirror-model",
  "prosemirror-state",
  "prosemirror-transform",
  "prosemirror-view",
  "react",
  "react-dom",
]);

export function findSingletonDependencyProblems(lockfile) {
  if (lockfile?.lockfileVersion !== 3 || !lockfile.packages || typeof lockfile.packages !== "object") {
    throw new Error("Expected an npm package-lock.json v3 with a packages map.");
  }

  const watched = new Set(SINGLETON_PACKAGES);
  const copies = new Map(SINGLETON_PACKAGES.map((name) => [name, []]));

  for (const [path, metadata] of Object.entries(lockfile.packages)) {
    const marker = "node_modules/";
    const index = path.lastIndexOf(marker);
    if (index < 0) continue;
    const name = path.slice(index + marker.length);
    if (!watched.has(name)) continue;
    copies.get(name).push({ path, version: metadata?.version });
  }

  const problems = [];
  for (const name of SINGLETON_PACKAGES) {
    const installed = copies.get(name);
    if (installed.length === 0) {
      problems.push(`${name}: missing from package-lock.json`);
    } else if (installed.some(({ version }) => typeof version !== "string" || !version)) {
      problems.push(`${name}: lockfile entry has no version`);
    } else if (installed.length > 1) {
      problems.push(`${name}: ${installed.length} installed copies (${installed.map(({ path, version }) => `${version} at ${path}`).join(", ")})`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const lockfile = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
    const problems = findSingletonDependencyProblems(lockfile);
    if (problems.length > 0) {
      console.error("Shared editor dependencies must have exactly one installed copy:");
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
    } else {
      console.log(`${SINGLETON_PACKAGES.length} shared editor dependencies have one installed copy each.`);
    }
  } catch (error) {
    console.error("Could not check shared editor dependencies:", error);
    process.exitCode = 1;
  }
}
