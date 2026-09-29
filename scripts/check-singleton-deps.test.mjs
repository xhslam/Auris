import assert from "node:assert/strict";
import test from "node:test";
import {
  findSingletonDependencyProblems,
  SINGLETON_PACKAGES,
} from "./check-singleton-deps.mjs";

function lockWithOneCopyEach() {
  return {
    lockfileVersion: 3,
    packages: Object.fromEntries(
      SINGLETON_PACKAGES.map((name) => [`node_modules/${name}`, { version: "1.0.0" }]),
    ),
  };
}

test("accepts one installed copy of each shared dependency", () => {
  assert.deepEqual(findSingletonDependencyProblems(lockWithOneCopyEach()), []);
});

test("rejects two physical copies even when their versions match", () => {
  const lock = lockWithOneCopyEach();
  lock.packages["node_modules/other/node_modules/@lezer/common"] = { version: "1.0.0" };
  assert.match(findSingletonDependencyProblems(lock).join("\n"), /@lezer\/common: 2 installed copies/u);
});

test("rejects missing or unversioned packages", () => {
  const lock = lockWithOneCopyEach();
  delete lock.packages["node_modules/react"];
  lock.packages["node_modules/@codemirror/state"] = {};
  const problems = findSingletonDependencyProblems(lock).join("\n");
  assert.match(problems, /react: missing/u);
  assert.match(problems, /@codemirror\/state: lockfile entry has no version/u);
});

test("rejects unsupported lockfile shapes", () => {
  assert.throws(() => findSingletonDependencyProblems({ lockfileVersion: 2 }), /v3/u);
});
