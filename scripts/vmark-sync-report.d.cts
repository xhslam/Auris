import type * as fs from "node:fs";
import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";

declare namespace vmarkSyncReport {
  const EXIT_CODES: Readonly<{
    SUCCESS: 0; ARGUMENT_INVALID: 2; MANIFEST_INVALID: 3; GIT_MISSING: 4;
    CACHE_INVALID: 5; CACHE_IDENTITY: 6; CACHE_BUSY: 7; GIT_FETCH_FAILED: 8;
    UPSTREAM_UNRESOLVED: 9; COMPARISON_FAILED: 10; REPORT_WRITE_FAILED: 11; INTERNAL_ERROR: 12;
  }>;
  type ErrorCode = keyof typeof EXIT_CODES;
  class SyncReportError extends Error {
    code: ErrorCode;
    exitCode: number;
    publicMessage: string;
    diagnostic?: string;
    constructor(code: ErrorCode, message: string, options?: ErrorOptions & { diagnostic?: string });
  }
  type Spawn = (command: string, argv: string[], options: SpawnSyncOptionsWithStringEncoding) => {
    error?: NodeJS.ErrnoException; status?: number | null; stdout?: string | Buffer; stderr?: string | Buffer;
  };
  type GitOptions = { cwd?: string; failureCode?: ErrorCode; publicDetail?: string };
  type GitRunner = (argv: string[], options?: GitOptions) => string;
  type ProcessIdentityProvider = (pid: number) => string | undefined;
  type LockOptions = {
    busyCode?: ErrorCode; invalidCode?: ErrorCode; fileSystem?: typeof fs;
    malformedStaleMs?: number; now?: () => number; pid?: number;
    processStartIdentity?: string | null; processStartIdentityProvider?: ProcessIdentityProvider;
    purpose?: string; randomToken?: () => string;
    isProcessAlive?: (pid: number, processStartIdentity?: string | null) => boolean;
  };
  type OwnershipLock = { token: string; release(this: OwnershipLock): boolean };
  type Change = { path: string; status: "changed" | "added" | "deleted" } |
    { path: string; fromPath: string; status: "renamed" };
  type Mapping = {
    mappingId: string; upstreamPaths: string[]; aurisPaths: string[];
    disposition: string; intentionalDifferences: string[];
    lastComparedCommit: string; tests: string[];
  };
  type ReviewDomain = {
    domainId: string; upstreamPrefixes: string[]; aurisPaths: string[];
    decision: string; rationale: string; lastComparedCommit: string;
  };
  type Manifest = {
    $schema: string; schemaVersion: number;
    upstream: { repository: string; commit: string; license: string };
    reviewDomains: ReviewDomain[]; entries: Mapping[];
  };
  type Report = {
    mappings: Array<Mapping & {
      matchedUpstreamChanges: Change[]; missingAurisTargets: string[]; staleLastComparedCommit: boolean;
    }>;
    unmappedUpstreamChanges: Change[];
    upstreamChanges: Change[];
    mappedUpstreamChanges: Change[];
    reviewDomains: unknown[];
    domainCandidates: unknown[];
    summary: Record<string, number>;
  };
  type ReportText = { json: string; markdown: string };
  type PublicationOptions = {
    outputDirectory: string; reports: ReportText; fileSystem?: typeof fs;
    afterMutation?: (phase: string) => void; lockOptions?: LockOptions;
  };
  type MainOptions = {
    projectRoot?: string; cacheRoot?: string; gitRunner?: GitRunner;
    stdout?: { write(value: string): unknown }; stderr?: { write(value: string): unknown };
    reportLockOptions?: LockOptions;
    reportWriter?: (options: PublicationOptions) => void;
  };
  function parseArgs(argv: string[]): { diagnostics: boolean; repositoryPath?: string; upstream: string };
  function validateManifest(manifest: unknown): Manifest;
  function createGitRunner(options?: { spawn?: Spawn; timeoutMs?: number }): GitRunner;
  function createProcessStartIdentityProvider(options?: {
    platform?: NodeJS.Platform; spawn?: Spawn; timeoutMs?: number;
  }): ProcessIdentityProvider;
  function defaultIsProcessAlive(pid: number, expectedStartIdentity?: string | null, options?: {
    processStartIdentityProvider?: ProcessIdentityProvider;
  }): boolean;
  function acquireOwnershipLock(lockDirectory: string, options?: LockOptions): OwnershipLock;
  function collectGitDiff(options: {
    repository: string; baselineCommit: string; upstream: string; gitRunner?: GitRunner;
  }): { resolvedCommit: string; changes: Change[] };
  function resolveCachePaths(options: { repositoryUrl: string; cacheRoot?: string }): {
    cacheDirectory: string; cacheName: string; cacheRoot: string; lockDirectory: string; normalizedRepository: string;
  };
  function prepareUpstreamCache(repositoryUrl: string, options?: {
    cacheRoot?: string; gitRunner?: GitRunner; lockOptions?: LockOptions;
  }): string;
  function renderReports(options: {
    manifest: unknown; resolvedCommit: string; changes: unknown[]; aurisRoot: string;
  }): ReportText & { report: Report };
  function publishReportsWithRecovery(options: PublicationOptions): void;
  function readPublishedReports(options: {
    outputDirectory: string; fileSystem?: typeof fs; lockOptions?: LockOptions;
  }): ReportText;
  function main(argv?: string[], options?: MainOptions): {
    changes: Change[]; reports: ReportText & { report: Report }; resolvedCommit: string;
  };
  function runCli(argv?: string[], options?: MainOptions): number;
}
export = vmarkSyncReport;
