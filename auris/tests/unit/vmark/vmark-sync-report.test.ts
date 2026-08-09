import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import * as nodeFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import syncReport from "../../../scripts/vmark-sync-report.cjs";

const {
  EXIT_CODES,
  acquireOwnershipLock,
  collectGitDiff,
  createGitRunner,
  createProcessStartIdentityProvider,
  defaultIsProcessAlive,
  main,
  parseArgs,
  prepareUpstreamCache,
  publishReportsWithRecovery,
  readPublishedReports,
  renderReports,
  resolveCachePaths,
  runCli,
  validateManifest,
} = syncReport;

const runGit = (repository: string, args: string[]) => {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
};

const writeFixtureFile = (repository: string, name: string, value: string) => {
  const target = path.join(repository, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value);
};

const canonicalProjectPath = z
  .string()
  .min(1)
  .regex(
    /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\/$).+$/,
  );
const canonicalUniqueArray = <T extends z.ZodType>(item: T) =>
  z.array(item).min(1).refine((values) => new Set(values).size === values.length);
const canonicalMapping = z.strictObject({
  mappingId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  upstreamPaths: canonicalUniqueArray(canonicalProjectPath),
  aurisPaths: canonicalUniqueArray(canonicalProjectPath),
  disposition: z.enum(["copied", "adapted", "rewritten", "not-applicable"]),
  intentionalDifferences: canonicalUniqueArray(z.string().min(1)),
  lastComparedCommit: z.string().regex(/^[0-9a-f]{40}$/),
  tests: canonicalUniqueArray(canonicalProjectPath),
});
const canonicalReviewDomain = z.strictObject({
  domainId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  upstreamPrefixes: canonicalUniqueArray(canonicalProjectPath),
  aurisPaths: canonicalUniqueArray(canonicalProjectPath),
  decision: z.enum(["port", "adapt", "defer", "reject"]),
  rationale: z.string().min(1),
  lastComparedCommit: z.string().regex(/^[0-9a-f]{40}$/),
});
const canonicalManifestContract = z.strictObject({
  $schema: z.literal("./manifest.schema.json"),
  schemaVersion: z.literal(2),
  upstream: z.strictObject({
    repository: z.url(),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    license: z.literal("ISC"),
  }),
  reviewDomains: z.array(canonicalReviewDomain).min(1),
  entries: z.array(canonicalMapping).min(1).superRefine((entries, context) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      if (seen.has(entry.mappingId)) {
        context.addIssue({
          code: "custom",
          message: "mappingId must be unique",
          path: [index, "mappingId"],
        });
      }
      seen.add(entry.mappingId);
    });
  }),
});

const holdLockInSubprocess = async (lockDirectory: string, purpose: string) => {
  const scriptPath = path.resolve("scripts/vmark-sync-report.cjs");
  const childSource = [
    `const { acquireOwnershipLock } = require(${JSON.stringify(scriptPath)});`,
    `acquireOwnershipLock(${JSON.stringify(lockDirectory)}, { purpose: ${JSON.stringify(purpose)} });`,
    'process.stdout.write("ready\\n");',
    "setInterval(() => {}, 1000);",
  ].join("\n");
  const child = spawn(process.execPath, ["-e", childSource], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("ready\n")) resolve();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!output.includes("ready\n")) {
        reject(new Error(`lock worker exited before ready (${code})`));
      }
    });
  });
  return child;
};

const killWorker = async (child: ReturnType<typeof spawn>) => {
  child.kill("SIGKILL");
  await once(child, "exit");
};

describe("VMark sync report", () => {
  let fixtureRoot: string;
  let repository: string;
  let aurisRoot: string;
  let baselineCommit: string;
  let comparedCommit: string;
  let repositoryUrl: string;

  beforeAll(() => {
    fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "auris-vmark-sync-test-"));
    repository = path.join(fixtureRoot, "upstream");
    aurisRoot = path.join(fixtureRoot, "auris");
    mkdirSync(repository, { recursive: true });
    mkdirSync(aurisRoot, { recursive: true });

    runGit(repository, ["init", "--initial-branch=main"]);
    runGit(repository, ["config", "user.email", "fixture@example.invalid"]);
    runGit(repository, ["config", "user.name", "Fixture"]);
    writeFixtureFile(repository, "changed.txt", "before\n");
    writeFixtureFile(repository, "deleted.txt", "delete me\n");
    writeFixtureFile(repository, "renamed-old.txt", "rename me without edits\n");
    writeFixtureFile(repository, "unchanged.txt", "same\n");
    runGit(repository, ["add", "."]);
    runGit(repository, ["commit", "-m", "baseline"]);
    baselineCommit = runGit(repository, ["rev-parse", "HEAD"]);

    writeFixtureFile(repository, "changed.txt", "after\n");
    rmSync(path.join(repository, "deleted.txt"));
    renameSync(
      path.join(repository, "renamed-old.txt"),
      path.join(repository, "renamed-new.txt"),
    );
    writeFixtureFile(repository, "added.txt", "new\n");
    runGit(repository, ["add", "-A"]);
    runGit(repository, ["commit", "-m", "comparison"]);
    comparedCommit = runGit(repository, ["rev-parse", "HEAD"]);

    runGit(repository, ["remote", "add", "origin", repository]);
    runGit(repository, [
      "update-ref",
      "refs/remotes/origin/main",
      comparedCommit,
    ]);
    repositoryUrl = pathToFileURL(repository).href;
    writeFixtureFile(aurisRoot, "present-target.ts", "export {};\n");
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("accepts only a full commit or the exact origin/main selector", () => {
    expect(parseArgs(["--upstream", comparedCommit])).toEqual({
      diagnostics: false,
      repositoryPath: undefined,
      upstream: comparedCommit,
    });
    expect(parseArgs(["--upstream", "origin/main"])).toEqual({
      diagnostics: false,
      repositoryPath: undefined,
      upstream: "origin/main",
    });
    expect(parseArgs([])).toEqual({
      diagnostics: false,
      repositoryPath: undefined,
      upstream: "origin/main",
    });

    for (const hostile of [
      "HEAD",
      "main",
      `${comparedCommit}; touch /tmp/pwned`,
      "origin/main && whoami",
      "$(whoami)",
      comparedCommit.slice(0, 12),
    ]) {
      expect(() => parseArgs(["--upstream", hostile])).toThrow(
        /full 40-character hexadecimal commit or origin\/main/,
      );
    }
    expect(() => parseArgs(["--other", comparedCommit])).toThrow(
      /Unknown argument/,
    );
  });

  it("accepts one absolute read-only repository fallback and diagnostics flag", () => {
    expect(
      parseArgs([
        "--diagnostics",
        "--repository-path",
        repository,
        "--upstream",
        comparedCommit,
      ]),
    ).toEqual({
      diagnostics: true,
      repositoryPath: repository,
      upstream: comparedCommit,
    });

    expect(() =>
      parseArgs(["--repository-path", "relative/repository"]),
    ).toThrow(/absolute path/);
    expect(() =>
      parseArgs([
        "--repository-path",
        repository,
        "--repository-path",
        repository,
      ]),
    ).toThrow(/only once/);
    expect(() =>
      parseArgs(["--diagnostics", "--diagnostics"]),
    ).toThrow(/only once/);
  });

  it("resolves an explicit commit and classifies changed paths deterministically", () => {
    const result = collectGitDiff({
      repository,
      baselineCommit,
      upstream: comparedCommit,
    });

    expect(result.resolvedCommit).toBe(comparedCommit);
    expect(result.changes).toEqual([
      { path: "added.txt", status: "added" },
      { path: "changed.txt", status: "changed" },
      { path: "deleted.txt", status: "deleted" },
      {
        fromPath: "renamed-old.txt",
        path: "renamed-new.txt",
        status: "renamed",
      },
    ]);

    expect(
      collectGitDiff({
        repository,
        baselineCommit,
        upstream: "origin/main",
      }).resolvedCommit,
    ).toBe(comparedCommit);
  });

  it("matches the canonical manifest constraints without rejecting many-to-many paths", () => {
    const validManifest = makeManifest(baselineCommit, comparedCommit);
    expect(validateManifest(validManifest)).toEqual(validManifest);

    const duplicateWithinEntry = structuredClone(validManifest);
    duplicateWithinEntry.entries[0].upstreamPaths.push("added.txt");
    expect(() => validateManifest(duplicateWithinEntry)).toThrow(
      /duplicate upstream path: added\.txt/,
    );

    const duplicateAcrossEntries = structuredClone(validManifest);
    duplicateAcrossEntries.entries[0].aurisPaths = ["present-target.ts"];
    duplicateAcrossEntries.entries[0].upstreamPaths = ["changed.txt"];
    expect(validateManifest(duplicateAcrossEntries)).toEqual(
      duplicateAcrossEntries,
    );
    expect(canonicalManifestContract.safeParse(duplicateAcrossEntries).success).toBe(
      true,
    );

    expect(() =>
      validateManifest({ ...validManifest, schemaVersion: 1 }),
    ).toThrow(/schemaVersion/);

    const representativeInvalidMutations = [
      (candidate: Record<string, unknown>) => {
        candidate.extra = true;
      },
      (candidate: ReturnType<typeof makeManifest>) => {
        candidate.entries[0].mappingId = "Invalid ID";
      },
      (candidate: ReturnType<typeof makeManifest>) => {
        candidate.entries[1].mappingId = candidate.entries[0].mappingId;
      },
      (candidate: ReturnType<typeof makeManifest>) => {
        candidate.entries[0].aurisPaths = ["../escape.ts"];
      },
      (candidate: ReturnType<typeof makeManifest>) => {
        candidate.entries[0].tests = [];
      },
      (candidate: ReturnType<typeof makeManifest>) => {
        candidate.upstream.commit = "short";
      },
    ];
    for (const mutate of representativeInvalidMutations) {
      const candidate = structuredClone(validManifest);
      mutate(candidate);
      expect(canonicalManifestContract.safeParse(candidate).success).toBe(false);
      expect(() => validateManifest(candidate)).toThrow();
    }
  });

  it("renders stable canonical JSON with missing targets and stale mappings", () => {
    const manifest = makeManifest(baselineCommit, comparedCommit);
    const changes = collectGitDiff({
      repository,
      baselineCommit,
      upstream: comparedCommit,
    }).changes;
    const reportChanges = [
      ...changes,
      { path: "src/nested.ts", status: "added" },
      { path: "outside.txt", status: "added" },
    ];
    const first = renderReports({
      manifest,
      resolvedCommit: comparedCommit,
      changes: [...reportChanges].reverse(),
      aurisRoot,
    });
    const second = renderReports({
      manifest: {
        ...manifest,
        entries: [...manifest.entries].reverse(),
        reviewDomains: [...manifest.reviewDomains].reverse(),
      },
      resolvedCommit: comparedCommit,
      changes: reportChanges,
      aurisRoot,
    });

    expect(first.json).toBe(second.json);
    expect(first.markdown).toBe(second.markdown);
    expect(first.json).not.toMatch(/timestamp|generatedAt|\d{4}-\d{2}-\d{2}T/);
    expect(first.json.endsWith("\n")).toBe(true);

    const report = JSON.parse(first.json);
    expect(Object.keys(report)).toEqual([
      "schemaVersion",
      "repository",
      "baselineCommit",
      "comparedCommit",
      "summary",
      "upstreamChanges",
      "mappedUpstreamChanges",
      "mappings",
      "reviewDomains",
      "domainCandidates",
      "unmappedUpstreamChanges",
    ]);
    expect(Object.keys(report.summary)).toEqual([
      "changed",
      "added",
      "deleted",
      "renamed",
      "missingAurisTargets",
      "staleMappings",
      "mappedUpstreamChanges",
      "domainCandidates",
      "unmappedUpstreamChanges",
    ]);
    expect(report.summary).toEqual({
      changed: 1,
      added: 3,
      deleted: 1,
      renamed: 1,
      missingAurisTargets: 1,
      staleMappings: 1,
      mappedUpstreamChanges: 4,
      domainCandidates: 1,
      unmappedUpstreamChanges: 1,
    });
    expect(report.mappings[0]).toMatchObject({
      mappingId: "current-mapping",
      missingAurisTargets: [],
      staleLastComparedCommit: false,
    });
    expect(report.mappings[1]).toMatchObject({
      mappingId: "stale-mapping",
      missingAurisTargets: ["missing-target.ts"],
      staleLastComparedCommit: true,
    });
    expect(report.unmappedUpstreamChanges).toEqual([
      { path: "outside.txt", status: "added" },
    ]);
    expect(report.mappedUpstreamChanges).toEqual([
      { path: "added.txt", status: "added" },
      { path: "changed.txt", status: "changed" },
      {
        fromPath: "renamed-old.txt",
        path: "renamed-new.txt",
        status: "renamed",
      },
      { path: "src/nested.ts", status: "added" },
    ]);
    expect(report.domainCandidates).toEqual([
      {
        change: { path: "deleted.txt", status: "deleted" },
        decision: "defer",
        domainId: "fixture-domain",
      },
    ]);
    expect(first.markdown).toContain("# VMark upstream comparison");
    expect(first.markdown).toContain("Missing Auris targets: **1**");
    expect(first.markdown).toContain("`stale-mapping`");

    const unmappedRename = renderReports({
      manifest,
      resolvedCommit: comparedCommit,
      changes: [
        {
          fromPath: "unmapped-old.txt",
          path: "unmapped-new.txt",
          status: "renamed",
        },
      ],
      aurisRoot,
    });
    expect(unmappedRename.markdown).toContain(
      "`unmapped-old.txt` → `unmapped-new.txt`",
    );
  });

  it("resolves reviewed window and status source families by directory or exact path", () => {
    const manifest = makeManifest(baselineCommit, comparedCommit);
    manifest.entries = [
      {
        mappingId: "multi-window-status",
        upstreamPaths: [
          "src-tauri/src/window_manager",
          "src/components/WindowStatusPanel",
          "src/stores/windowStatusStore.ts",
        ],
        aurisPaths: ["present-target.ts"],
        disposition: "rewritten",
        intentionalDifferences: ["Electron owns native window routing."],
        lastComparedCommit: comparedCommit,
        tests: ["tests/window-status.test.ts"],
      },
    ];
    const rendered = renderReports({
      manifest,
      resolvedCommit: comparedCommit,
      changes: [
        { path: "src-tauri/src/window_manager/mod.rs", status: "changed" },
        { path: "src/components/WindowStatusPanel/index.tsx", status: "added" },
        { path: "src/stores/windowStatusStore.ts", status: "changed" },
        { path: "src/unrelated.ts", status: "added" },
      ],
      aurisRoot,
    });

    expect(rendered.report.mappings[0].matchedUpstreamChanges).toHaveLength(3);
    expect(rendered.report.unmappedUpstreamChanges).toEqual([
      { path: "src/unrelated.ts", status: "added" },
    ]);
  });

  it("uses a URL-derived private cache and rejects identity/collision hazards", () => {
    const cacheRoot = mkdtempSync(
      path.join(os.tmpdir(), "auris-vmark-cache-test-"),
    );
    const otherRepository = path.join(fixtureRoot, "other-upstream");
    mkdirSync(otherRepository);
    runGit(otherRepository, ["init", "--initial-branch=main"]);

    try {
      const paths = resolveCachePaths({ repositoryUrl, cacheRoot });
      expect(paths.cacheDirectory.startsWith(`${cacheRoot}${path.sep}`)).toBe(
        true,
      );
      expect(paths.cacheDirectory).not.toContain("upstream/../");

      expect(
        prepareUpstreamCache(repositoryUrl, { cacheRoot }),
      ).toBe(paths.cacheDirectory);
      runGit(paths.cacheDirectory, [
        "remote",
        "set-url",
        "origin",
        pathToFileURL(otherRepository).href,
      ]);
      expect(() =>
        prepareUpstreamCache(repositoryUrl, { cacheRoot }),
      ).toThrowError(expect.objectContaining({ code: "CACHE_IDENTITY" }));

      rmSync(paths.cacheDirectory, { recursive: true, force: true });
      writeFileSync(paths.cacheDirectory, "collision");
      expect(() =>
        prepareUpstreamCache(repositoryUrl, { cacheRoot }),
      ).toThrowError(expect.objectContaining({ code: "CACHE_INVALID" }));
      rmSync(paths.cacheDirectory);

      mkdirSync(paths.lockDirectory);
      expect(() =>
        prepareUpstreamCache(repositoryUrl, { cacheRoot }),
      ).toThrowError(expect.objectContaining({ code: "CACHE_BUSY" }));
      rmSync(paths.lockDirectory, { recursive: true });

      symlinkSync(repository, paths.cacheDirectory);
      expect(() =>
        prepareUpstreamCache(repositoryUrl, { cacheRoot }),
      ).toThrowError(expect.objectContaining({ code: "CACHE_INVALID" }));
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  it("bounds non-interactive Git execution and categorizes spawn failures", () => {
    let observedOptions: Record<string, unknown> | undefined;
    const missingGit = Object.assign(new Error("private executable path"), {
      code: "ENOENT",
    });
    const runner = createGitRunner({
      timeoutMs: 1234,
      spawn: (_command: string, _argv: string[], options: object) => {
        observedOptions = options as Record<string, unknown>;
        return { error: missingGit };
      },
    });

    expect(() => runner(["--version"])).toThrowError(
      expect.objectContaining({ code: "GIT_MISSING" }),
    );
    expect(observedOptions).toMatchObject({ shell: false, timeout: 1234 });
    expect((observedOptions?.env as Record<string, string>).GIT_TERMINAL_PROMPT).toBe(
      "0",
    );
  });

  it("publishes both reports under a recoverable reader/writer lock", () => {
    const outputDirectory = mkdtempSync(
      path.join(os.tmpdir(), "auris-vmark-report-write-"),
    );
    try {
      writeFileSync(path.join(outputDirectory, "latest.json"), "old-json");
      writeFileSync(path.join(outputDirectory, "latest.md"), "old-markdown");
      publishReportsWithRecovery({
        outputDirectory,
        reports: { json: "new-json\n", markdown: "new-markdown\n" },
      });
      expect(readFileSync(path.join(outputDirectory, "latest.json"), "utf8")).toBe(
        "new-json\n",
      );
      expect(readFileSync(path.join(outputDirectory, "latest.md"), "utf8")).toBe(
        "new-markdown\n",
      );
      expect(existsSync(path.join(outputDirectory, ".vmark-sync-write.lock"))).toBe(
        false,
      );

      const failingFileSystem = {
        ...nodeFs,
        renameSync: (source: nodeFs.PathLike, target: nodeFs.PathLike) => {
          if (
            path.basename(String(source)) === "next.md" &&
            path.basename(String(target)) === "latest.md"
          ) {
            throw new Error("simulated second-report failure");
          }
          return nodeFs.renameSync(source, target);
        },
      };
      expect(() =>
        publishReportsWithRecovery({
          outputDirectory,
          reports: { json: "mixed-json\n", markdown: "mixed-markdown\n" },
          fileSystem: failingFileSystem,
        }),
      ).toThrowError(expect.objectContaining({ code: "REPORT_WRITE_FAILED" }));
      expect(readPublishedReports({ outputDirectory })).toEqual({
        json: "mixed-json\n",
        markdown: "mixed-markdown\n",
      });
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    "prepared",
    "json-backed-up",
    "markdown-backed-up",
    "json-published",
    "markdown-published",
  ])("recovers a report transaction interrupted after %s", (crashPhase) => {
    const outputDirectory = mkdtempSync(
      path.join(os.tmpdir(), "auris-vmark-report-crash-"),
    );
    try {
      publishReportsWithRecovery({
        outputDirectory,
        reports: { json: "old-generation\n", markdown: "old-generation\n" },
      });
      expect(() =>
        publishReportsWithRecovery({
          outputDirectory,
          reports: { json: "new-generation\n", markdown: "new-generation\n" },
          afterMutation: (phase: string) => {
            if (phase === crashPhase) throw new Error("simulated termination");
          },
        }),
      ).toThrowError(expect.objectContaining({ code: "REPORT_WRITE_FAILED" }));

      expect(readPublishedReports({ outputDirectory })).toEqual({
        json: "new-generation\n",
        markdown: "new-generation\n",
      });
      expect(
        existsSync(path.join(outputDirectory, ".vmark-sync-transaction")),
      ).toBe(false);
      expect(
        existsSync(path.join(outputDirectory, ".vmark-sync-write.lock")),
      ).toBe(false);
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it("reclaims cache and report locks left by killed owner processes", async () => {
    const cacheRoot = mkdtempSync(
      path.join(os.tmpdir(), "auris-vmark-dead-cache-lock-"),
    );
    const outputDirectory = mkdtempSync(
      path.join(os.tmpdir(), "auris-vmark-dead-report-lock-"),
    );
    try {
      const cachePaths = resolveCachePaths({ repositoryUrl, cacheRoot });
      const cacheWorker = await holdLockInSubprocess(
        cachePaths.lockDirectory,
        "cache",
      );
      await killWorker(cacheWorker);
      expect(
        prepareUpstreamCache(repositoryUrl, { cacheRoot }),
      ).toBe(cachePaths.cacheDirectory);

      const reportLock = path.join(outputDirectory, ".vmark-sync-write.lock");
      const reportWorker = await holdLockInSubprocess(reportLock, "report");
      await killWorker(reportWorker);
      publishReportsWithRecovery({
        outputDirectory,
        reports: { json: "recovered\n", markdown: "recovered\n" },
      });
      expect(readPublishedReports({ outputDirectory })).toEqual({
        json: "recovered\n",
        markdown: "recovered\n",
      });
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it("allows only the matching ownership token to release a lock", () => {
    const lockRoot = mkdtempSync(path.join(os.tmpdir(), "auris-vmark-token-lock-"));
    const lockDirectory = path.join(lockRoot, "owned.lock");
    try {
      const owner = acquireOwnershipLock(lockDirectory, { purpose: "test" });
      const metadata = JSON.parse(
        readFileSync(path.join(lockDirectory, "owner.json"), "utf8"),
      );
      expect(metadata).toMatchObject({
        version: 2,
        token: owner.token,
        pid: process.pid,
        purpose: "test",
      });
      expect(metadata.processStartIdentity).toEqual(expect.any(String));
      expect(metadata.acquiredAtMs).toEqual(expect.any(Number));
      const impostor = { ...owner, token: "not-the-owner-token" };
      expect(owner.release.call(impostor)).toBe(false);
      expect(existsSync(lockDirectory)).toBe(true);
      expect(owner.release()).toBe(true);
      expect(existsSync(lockDirectory)).toBe(false);
    } finally {
      rmSync(lockRoot, { recursive: true, force: true });
    }
  });

  it("matches PID and process-start identity before treating a lock as live", () => {
    const lockRoot = mkdtempSync(
      path.join(os.tmpdir(), "auris-vmark-process-identity-"),
    );
    const lockDirectory = path.join(lockRoot, "identity.lock");
    try {
      const original = acquireOwnershipLock(lockDirectory, {
        pid: process.pid,
        processStartIdentity: "posix:original-start",
        processStartIdentityProvider: () => "posix:original-start",
        purpose: "test",
      });
      expect(() =>
        acquireOwnershipLock(lockDirectory, {
          pid: process.pid,
          processStartIdentity: "posix:original-start",
          processStartIdentityProvider: () => "posix:original-start",
          purpose: "test",
        }),
      ).toThrowError(expect.objectContaining({ code: "CACHE_BUSY" }));

      const replacement = acquireOwnershipLock(lockDirectory, {
        pid: process.pid,
        processStartIdentity: "posix:replacement-start",
        processStartIdentityProvider: () => "posix:replacement-start",
        purpose: "test",
      });
      expect(replacement.token).not.toBe(original.token);
      expect(original.release()).toBe(false);
      expect(replacement.release()).toBe(true);
    } finally {
      rmSync(lockRoot, { recursive: true, force: true });
    }
  });

  it("normalizes bounded process-start providers without invoking a shell", () => {
    const observed: Array<{ command: string; argv: string[]; options: object }> = [];
    const posixProvider = createProcessStartIdentityProvider({
      platform: "darwin",
      timeoutMs: 4321,
      spawn: (command: string, argv: string[], options: object) => {
        observed.push({ command, argv, options });
        return {
          status: 0,
          stdout: "  Fri   Jul 17 21:00:00 2026  \n",
        };
      },
    });
    expect(posixProvider(42)).toBe("posix:Fri Jul 17 21:00:00 2026");
    expect(observed[0]).toMatchObject({
      command: "ps",
      argv: ["-o", "lstart=", "-p", "42"],
      options: {
        env: expect.objectContaining({ LC_ALL: "C", TZ: "UTC" }),
        shell: false,
        timeout: 4321,
      },
    });

    const windowsProvider = createProcessStartIdentityProvider({
      platform: "win32",
      spawn: (command: string, argv: string[], options: object) => {
        observed.push({ command, argv, options });
        return { status: 0, stdout: "2026-07-17T13:00:00.0000000Z\r\n" };
      },
    });
    expect(windowsProvider(77)).toBe(
      "windows:2026-07-17T13:00:00.0000000Z",
    );
    expect(observed[1].command).toBe("powershell.exe");
    expect(observed[1].argv.at(-1)).toBe("77");
    expect(observed[1].options).toMatchObject({ shell: false });

    const unavailableProvider = createProcessStartIdentityProvider({
      platform: "linux",
      spawn: () => ({
        error: Object.assign(new Error("missing ps"), { code: "ENOENT" }),
      }),
    });
    expect(unavailableProvider(42)).toBeUndefined();
    expect(
      defaultIsProcessAlive(process.pid, "posix:unknown", {
        processStartIdentityProvider: () => undefined,
      }),
    ).toBe(true);
  });

  it("keeps the real POSIX process identity stable across caller timezones", () => {
    if (process.platform === "win32") return;
    const originalTimezone = process.env.TZ;
    const provider = createProcessStartIdentityProvider();
    try {
      process.env.TZ = "UTC";
      const utcIdentity = provider(process.pid);
      process.env.TZ = "Asia/Shanghai";
      const shanghaiIdentity = provider(process.pid);
      expect(utcIdentity).toEqual(expect.any(String));
      expect(shanghaiIdentity).toBe(utcIdentity);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("treats a live lock as busy when callers use different timezones", () => {
    if (process.platform === "win32") return;
    const originalTimezone = process.env.TZ;
    const lockRoot = mkdtempSync(
      path.join(os.tmpdir(), "auris-vmark-timezone-lock-"),
    );
    const lockDirectory = path.join(lockRoot, "timezone.lock");
    let owner: ReturnType<typeof acquireOwnershipLock> | undefined;
    try {
      process.env.TZ = "UTC";
      owner = acquireOwnershipLock(lockDirectory, { purpose: "timezone-test" });
      process.env.TZ = "Asia/Shanghai";
      expect(() =>
        acquireOwnershipLock(lockDirectory, { purpose: "timezone-test" }),
      ).toThrowError(expect.objectContaining({ code: "CACHE_BUSY" }));
      expect(owner.release()).toBe(true);
      owner = undefined;
    } finally {
      owner?.release();
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
      rmSync(lockRoot, { recursive: true, force: true });
    }
  });

  it("holds fresh malformed locks conservatively and reclaims them after aging", () => {
    const lockRoot = mkdtempSync(
      path.join(os.tmpdir(), "auris-vmark-malformed-lock-"),
    );
    const lockDirectory = path.join(lockRoot, "malformed.lock");
    try {
      mkdirSync(lockDirectory);
      writeFileSync(path.join(lockDirectory, "owner.json"), "not-json\n");
      expect(() =>
        acquireOwnershipLock(lockDirectory, {
          malformedStaleMs: 60_000,
          purpose: "test",
        }),
      ).toThrowError(expect.objectContaining({ code: "CACHE_BUSY" }));

      const old = new Date(Date.now() - 120_000);
      utimesSync(lockDirectory, old, old);
      const recovered = acquireOwnershipLock(lockDirectory, {
        malformedStaleMs: 60_000,
        purpose: "test",
      });
      expect(recovered.release()).toBe(true);
      expect(existsSync(lockDirectory)).toBe(false);
    } finally {
      rmSync(lockRoot, { recursive: true, force: true });
    }
  });

  it("recovers after a subprocess is killed mid-publication", async () => {
    const outputDirectory = mkdtempSync(
      path.join(os.tmpdir(), "auris-vmark-killed-publication-"),
    );
    try {
      publishReportsWithRecovery({
        outputDirectory,
        reports: { json: "old-pair\n", markdown: "old-pair\n" },
      });
      const scriptPath = path.resolve("scripts/vmark-sync-report.cjs");
      const childSource = [
        `const { publishReportsWithRecovery } = require(${JSON.stringify(scriptPath)});`,
        `publishReportsWithRecovery({`,
        `  outputDirectory: ${JSON.stringify(outputDirectory)},`,
        `  reports: { json: "killed-pair\\n", markdown: "killed-pair\\n" },`,
        `  afterMutation(phase) {`,
        `    if (phase === "json-published") process.kill(process.pid, "SIGKILL");`,
        `  },`,
        `});`,
      ].join("\n");
      const child = spawn(process.execPath, ["-e", childSource], {
        stdio: "ignore",
      });
      const [code, signal] = (await once(child, "exit")) as [
        number | null,
        NodeJS.Signals | null,
      ];
      expect(code !== 0 || signal !== null).toBe(true);

      expect(readPublishedReports({ outputDirectory })).toEqual({
        json: "killed-pair\n",
        markdown: "killed-pair\n",
      });
      expect(
        existsSync(path.join(outputDirectory, ".vmark-sync-write.lock")),
      ).toBe(false);
      expect(
        existsSync(path.join(outputDirectory, ".vmark-sync-transaction")),
      ).toBe(false);
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it("returns stable CLI exit codes without leaking private failure details", () => {
    const cliProject = path.join(fixtureRoot, "cli-project");
    const manifestDirectory = path.join(cliProject, "docs", "vmark-port");
    mkdirSync(manifestDirectory, { recursive: true });
    const cliManifest = makeManifest(baselineCommit, comparedCommit);
    cliManifest.upstream.repository = repositoryUrl;
    const writeCliManifest = (manifest: unknown) =>
      writeFileSync(
        path.join(manifestDirectory, "manifest.json"),
        `${JSON.stringify(manifest)}\n`,
      );
    writeCliManifest(cliManifest);

    const invoke = (
      argv: string[],
      options: Record<string, unknown> = {},
    ) => {
      let stderr = "";
      const exitCode = runCli(argv, {
        projectRoot: cliProject,
        cacheRoot: mkdtempSync(path.join(fixtureRoot, "cli-cache-")),
        stdout: { write: () => true },
        stderr: {
          write: (value: string) => {
            stderr += value;
            return true;
          },
        },
        ...options,
      });
      return { exitCode, stderr };
    };

    writeCliManifest({ ...cliManifest, schemaVersion: 1 });
    expect(invoke(["--upstream", comparedCommit])).toEqual({
      exitCode: EXIT_CODES.MANIFEST_INVALID,
      stderr:
        "VMark sync report failed [MANIFEST_INVALID]: The VMark port manifest is invalid.\n",
    });
    writeCliManifest(cliManifest);

    expect(
      invoke(["--upstream", "0".repeat(40)]),
    ).toEqual({
      exitCode: EXIT_CODES.UPSTREAM_UNRESOLVED,
      stderr:
        "VMark sync report failed [UPSTREAM_UNRESOLVED]: The selected upstream commit could not be resolved.\n",
    });

    const spawnError = Object.assign(new Error("/private/bin/git secret"), {
      code: "ENOENT",
    });
    expect(
      invoke(["--upstream", comparedCommit], {
        gitRunner: createGitRunner({
          spawn: () => ({ error: spawnError }),
        }),
      }),
    ).toEqual({
      exitCode: EXIT_CODES.GIT_MISSING,
      stderr: "VMark sync report failed [GIT_MISSING]: Git is required.\n",
    });

    const cacheRoot = mkdtempSync(path.join(fixtureRoot, "cli-collision-"));
    const collision = resolveCachePaths({ repositoryUrl, cacheRoot });
    writeFileSync(collision.cacheDirectory, "not a repository");
    expect(
      invoke(["--upstream", comparedCommit], { cacheRoot }),
    ).toEqual({
      exitCode: EXIT_CODES.CACHE_INVALID,
      stderr:
        "VMark sync report failed [CACHE_INVALID]: The upstream cache is not a safe Auris cache directory.\n",
    });

    const fetchRoot = mkdtempSync(path.join(fixtureRoot, "cli-fetch-"));
    prepareUpstreamCache(repositoryUrl, { cacheRoot: fetchRoot });
    const realRunner = createGitRunner();
    const failingFetchRunner = (
      argv: string[],
      options: Record<string, unknown>,
    ) => {
      if (argv.includes("fetch")) {
        const error = new Error("private fetch token");
        Object.assign(error, { code: "GIT_FETCH_FAILED" });
        throw error;
      }
      return realRunner(argv, options);
    };
    expect(
      invoke(["--upstream", comparedCommit], {
        cacheRoot: fetchRoot,
        gitRunner: failingFetchRunner,
      }),
    ).toEqual({
      exitCode: EXIT_CODES.GIT_FETCH_FAILED,
      stderr:
        "VMark sync report failed [GIT_FETCH_FAILED]: The upstream cache could not be refreshed.\n",
    });

    expect(
      invoke(["--upstream", comparedCommit], {
        reportWriter: () => {
          throw new Error("/private/output secret");
        },
      }),
    ).toEqual({
      exitCode: EXIT_CODES.REPORT_WRITE_FAILED,
      stderr:
        "VMark sync report failed [REPORT_WRITE_FAILED]: The comparison reports could not be written.\n",
    });
  });

  it("uses an explicitly supplied local repository without cloning or fetching", () => {
    const projectRoot = path.join(fixtureRoot, "local-fallback-project");
    const manifestDirectory = path.join(projectRoot, "docs", "vmark-port");
    mkdirSync(manifestDirectory, { recursive: true });
    const localManifest = makeManifest(baselineCommit, comparedCommit);
    localManifest.upstream.repository = repositoryUrl;
    writeFileSync(
      path.join(manifestDirectory, "manifest.json"),
      `${JSON.stringify(localManifest)}\n`,
    );
    const invocations: string[][] = [];
    const gitRunner = (
      argv: string[],
      options: Record<string, unknown>,
    ) => {
      invocations.push(argv);
      return createGitRunner()(argv, options);
    };

    const result = main([
      "--repository-path",
      repository,
      "--upstream",
      comparedCommit,
    ], {
      gitRunner,
      projectRoot,
      reportWriter: () => undefined,
      stdout: { write: () => true },
    });

    expect(result.resolvedCommit).toBe(comparedCommit);
    expect(invocations.some((argv) => argv.includes("clone"))).toBe(false);
    expect(invocations.some((argv) => argv.includes("fetch"))).toBe(false);
    expect(invocations).toContainEqual(["remote", "get-url", "origin"]);
  });

  it("emits only fingerprinted git diagnostics when explicitly requested", () => {
    const cliProject = path.join(fixtureRoot, "diagnostic-project");
    const manifestDirectory = path.join(cliProject, "docs", "vmark-port");
    mkdirSync(manifestDirectory, { recursive: true });
    const diagnosticManifest = makeManifest(baselineCommit, comparedCommit);
    diagnosticManifest.upstream.repository = repositoryUrl;
    writeFileSync(
      path.join(manifestDirectory, "manifest.json"),
      `${JSON.stringify(diagnosticManifest)}\n`,
    );
    let stderr = "";
    const exitCode = runCli([
      "--diagnostics",
      "--upstream",
      comparedCommit,
    ], {
      cacheRoot: mkdtempSync(path.join(fixtureRoot, "diagnostic-cache-")),
      gitRunner: createGitRunner({
        spawn: () => ({
          status: 128,
          stderr:
            "fatal: Authentication failed for https://secret-user:secret-token@example.invalid/private.git",
          stdout: "",
        }),
      }),
      projectRoot: cliProject,
      stderr: {
        write: (value: string) => {
          stderr += value;
          return true;
        },
      },
      stdout: { write: () => true },
    });

    expect(exitCode).toBe(EXIT_CODES.GIT_FETCH_FAILED);
    expect(stderr).toContain("Diagnostic: git=clone status=128");
    expect(stderr).toMatch(/stderr_bytes=\d+ stderr_sha256=[0-9a-f]{12}/);
    expect(stderr).toMatch(/cache=repository-[0-9a-f]{24}/);
    expect(stderr).not.toContain("secret-user");
    expect(stderr).not.toContain("secret-token");
    expect(stderr).not.toContain("private.git");
    expect(stderr).not.toContain(fixtureRoot);
  });

  const makeManifest = (baseline: string, compared: string) => ({
    $schema: "./manifest.schema.json",
    schemaVersion: 2,
    upstream: {
      repository: "https://example.invalid/vmark",
      commit: baseline,
      license: "ISC",
    },
    reviewDomains: [
      {
        domainId: "fixture-domain",
        upstreamPrefixes: ["deleted.txt"],
        aurisPaths: ["present-target.ts"],
        decision: "defer",
        rationale: "Fixture domain review.",
        lastComparedCommit: compared,
      },
    ],
    entries: [
      {
        mappingId: "stale-mapping",
        upstreamPaths: ["added.txt", "renamed-old.txt", "src"],
        aurisPaths: ["missing-target.ts"],
        disposition: "rewritten",
        intentionalDifferences: ["Fixture rewrite."],
        lastComparedCommit: baseline,
        tests: ["tests/stale.test.ts"],
      },
      {
        mappingId: "current-mapping",
        upstreamPaths: ["changed.txt"],
        aurisPaths: ["present-target.ts"],
        disposition: "adapted",
        intentionalDifferences: ["Fixture adaptation."],
        lastComparedCommit: compared,
        tests: ["tests/current.test.ts"],
      },
    ],
  });
});
