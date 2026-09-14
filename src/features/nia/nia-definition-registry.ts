/**
 * Thin typed facade over Nia definition lookup results for UI consumers.
 *
 * All heavy I/O (installing, uninstalling, reparsing raw source, atomic
 * writes) lives in the main-process `electron/nia/nia-definition-store.cjs`.
 * This module only shapes/sorts/looks-up already-resolved descriptors — it
 * never touches the filesystem and never re-derives trust decisions that
 * belong to the packaged contract or the store.
 */
import type {
  NiaDefinitionAst,
  NiaStepRef,
} from "../../../electron/shared/nia-definition-contract.cjs";

export type { NiaStepRef };

export type NiaDefinitionProvenance = "built-in" | "installed";

/**
 * Shape returned by `nia-definition-store.cjs#list()` / `#get()`. Kept in
 * sync by hand (not re-derived from the Zod schema) because this is a
 * renderer-safe type-only view, not a runtime validator.
 */
export interface NiaDefinitionRecord {
  readonly label: "Nia";
  readonly canonicalId: string;
  readonly provenance: NiaDefinitionProvenance;
  readonly sourceCompatibility: NiaDefinitionAst["sourceCompatibility"];
  readonly description: string;
  readonly scope: NiaDefinitionAst["scope"];
  readonly category?: string;
  readonly model?: string;
  readonly action?: NiaDefinitionAst["action"];
  readonly context?: number;
  readonly approval?: NiaDefinitionAst["approval"];
  readonly input?: NiaDefinitionAst["input"];
  readonly output?: NiaDefinitionAst["output"];
  readonly tags?: readonly string[];
  readonly body: string;
  readonly diagnostics?: readonly string[];
  readonly installedAt?: string;
}

export interface NiaDefinitionResolution extends NiaDefinitionRecord {
  readonly ref: NiaStepRef;
}

/**
 * Canonical-identity lookup normalization mirroring the store's own
 * `normalizeCanonicalName` (NFKC + casefold) so a UI list fetched over IPC
 * can be searched/filtered with the same case/Unicode-insensitive identity
 * rules used for install/uninstall collisions.
 */
export function normalizeNiaDefinitionLookupName(rawName: string): string {
  if (typeof rawName !== "string" || rawName.length === 0) {
    throw new TypeError("A Nia definition name is required.");
  }
  return rawName.normalize("NFKC").toLowerCase().trim();
}

export function sortNiaDefinitionRecords<T extends { canonicalId: string }>(
  records: readonly T[],
): T[] {
  return [...records].sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
}

export function findNiaDefinitionByCanonicalId<T extends { canonicalId: string }>(
  records: readonly T[],
  canonicalId: string,
): T | undefined {
  const normalized = normalizeNiaDefinitionLookupName(canonicalId);
  return records.find(
    (record) => normalizeNiaDefinitionLookupName(record.canonicalId) === normalized,
  );
}

export function groupNiaDefinitionsByProvenance<T extends { provenance: NiaDefinitionProvenance }>(
  records: readonly T[],
): { builtIn: T[]; installed: T[] } {
  const builtIn: T[] = [];
  const installed: T[] = [];
  for (const record of records) {
    if (record.provenance === "built-in") builtIn.push(record);
    else installed.push(record);
  }
  return { builtIn, installed };
}

/**
 * Provenance and labels always display as Nia — even a resolved legacy
 * `genie/<name>` reference or an imported `genie: v1` / unversioned Genie
 * file never surfaces a "Genie" label in the UI.
 */
export function niaDefinitionDisplayLabel(): "Nia" {
  return "Nia";
}

export function describeNiaDefinitionUsesRef(ref: NiaStepRef): string {
  return `nia/${ref.name}`;
}
