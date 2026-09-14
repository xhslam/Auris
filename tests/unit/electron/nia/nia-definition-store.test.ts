import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILT_IN_NIA_DEFINITIONS } from "@/features/nia/built-in-definitions";

const require = createRequire(import.meta.url);
const {
  createNiaDefinitionStore,
  NiaDefinitionStoreError,
} = require("../../../../electron/nia/nia-definition-store.cjs");
const { NiaDefinitionError } = require("../../../../electron/shared/nia-definition-contract.cjs");

function fixture(name: string): string {
  return require("node:fs").readFileSync(
    path.resolve("tests/fixtures/nia", name),
    "utf8",
  ) as string;
}

const NIA_V1_FIXTURE = fixture("nia-v1.md");
const GENIE_V1_FIXTURE = fixture("genie-v1.md");
const GENIE_V0_FIXTURE = fixture("genie-v0.md");

describe("createNiaDefinitionStore", () => {
  let tempDirectory: string;

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "auris-nia-store-"));
  });

  afterEach(async () => {
    await fs.rm(tempDirectory, { force: true, recursive: true });
  });

  function createStore(builtins: { name: string; source: string }[] = []) {
    return createNiaDefinitionStore({ baseDir: tempDirectory, builtins });
  }

  describe("construction", () => {
    it("requires a baseDir", () => {
      expect(() => createNiaDefinitionStore({})).toThrow(NiaDefinitionStoreError);
      try {
        createNiaDefinitionStore({});
      } catch (error) {
        expect((error as InstanceType<typeof NiaDefinitionStoreError>).code).toBe("INVALID_BASE_DIR");
      }
    });

    it("reparses built-in sources through the packaged contract at construction time", () => {
      const store = createStore([{ name: "improve-clarity", source: BUILT_IN_NIA_DEFINITIONS[0].source }]);
      expect(store).toBeTruthy();
    });

    it("rejects an invalid built-in source", () => {
      expect(() => createStore([{ name: "broken", source: "not a definition" }])).toThrow(NiaDefinitionError);
    });
  });

  describe("lookup by canonical and legacy references", () => {
    it("finds a built-in by canonical nia/<name> and legacy genie/<name>", async () => {
      const store = createStore([{ name: "improve-clarity", source: BUILT_IN_NIA_DEFINITIONS[0].source }]);
      const viaCanonical = await store.get("nia/improve-clarity");
      const viaLegacy = await store.get("genie/improve-clarity");
      expect(viaCanonical?.canonicalId).toBe("improve-clarity");
      expect(viaLegacy?.canonicalId).toBe("improve-clarity");
      expect(viaCanonical?.label).toBe("Nia");
      expect(viaLegacy?.label).toBe("Nia");
      expect(viaCanonical?.provenance).toBe("built-in");
    });

    it("finds an installed definition by canonical and legacy reference forms", async () => {
      const store = createStore();
      await store.install(GENIE_V1_FIXTURE, { filenameHint: "improve.md" });

      const viaCanonical = await store.get("nia/improve");
      const viaLegacy = await store.get("genie/improve");
      const viaBareName = await store.get("improve");

      expect(viaCanonical?.canonicalId).toBe("improve");
      expect(viaLegacy?.canonicalId).toBe("improve");
      expect(viaBareName?.canonicalId).toBe("improve");
      expect(viaCanonical?.label).toBe("Nia");
      expect(viaLegacy?.label).toBe("Nia");
      expect(viaCanonical?.provenance).toBe("installed");
      // Provenance is always displayed as Nia even though the stored source
      // is a legacy genie: v1 file.
      expect(viaCanonical?.sourceCompatibility).toBe("legacy_genie_v1");
    });

    it("returns null for an unknown reference", async () => {
      const store = createStore();
      expect(await store.get("nia/does-not-exist")).toBeNull();
    });

    it("rejects a malformed reference", async () => {
      const store = createStore();
      await expect(store.get("not-a-valid-ref/../etc")).rejects.toThrow();
      await expect(store.get(42 as unknown as string)).rejects.toThrow();
    });

    it("lists built-ins and installed definitions together, sorted by canonical id", async () => {
      const store = createStore([{ name: "zzz-builtin", source: BUILT_IN_NIA_DEFINITIONS[0].source.replace("id: improve-clarity", "id: zzz-builtin") }]);
      await store.install(NIA_V1_FIXTURE, { filenameHint: "aaa-installed.md" });

      const list = await store.list();
      expect(list.map((entry: { canonicalId: string }) => entry.canonicalId)).toEqual([
        "aaa-installed",
        "zzz-builtin",
      ]);
      expect(list.every((entry: { label: string }) => entry.label === "Nia")).toBe(true);
    });
  });

  describe("install", () => {
    it("installs a canonical nia: v1 definition using a filenameHint identity", async () => {
      const store = createStore();
      const descriptor = await store.install(NIA_V1_FIXTURE, { filenameHint: "improve-text.md" });
      expect(descriptor.canonicalId).toBe("improve-text");
      expect(descriptor.sourceCompatibility).toBe("canonical_v1");
      expect(descriptor.label).toBe("Nia");
      expect(descriptor.provenance).toBe("installed");
      expect(typeof descriptor.installedAt).toBe("string");
    });

    it("installs a legacy genie: v1 definition", async () => {
      const store = createStore();
      const descriptor = await store.install(GENIE_V1_FIXTURE, { filenameHint: "improve.md" });
      expect(descriptor.canonicalId).toBe("improve");
      expect(descriptor.sourceCompatibility).toBe("legacy_genie_v1");
      expect(descriptor.label).toBe("Nia");
    });

    it("installs an unversioned legacy genie: v0 definition", async () => {
      const store = createStore();
      const descriptor = await store.install(GENIE_V0_FIXTURE, { filenameHint: "improve-v0.md" });
      expect(descriptor.canonicalId).toBe("improve-v0");
      expect(descriptor.sourceCompatibility).toBe("legacy_genie_v0");
      expect(descriptor.label).toBe("Nia");
    });

    it("uses an explicit id frontmatter field over the filenameHint", async () => {
      const store = createStore();
      const source = NIA_V1_FIXTURE.replace(
        "nia: v1\n",
        "nia: v1\nid: explicit-id\n",
      );
      const descriptor = await store.install(source, { filenameHint: "ignored-hint.md" });
      expect(descriptor.canonicalId).toBe("explicit-id");
      expect(await store.get("explicit-id")).toBeTruthy();
      expect(await store.get("ignored-hint")).toBeNull();
    });

    it("writes the definition file atomically with no leftover temp files", async () => {
      const store = createStore();
      await store.install(NIA_V1_FIXTURE, { filenameHint: "atomic-check.md" });
      const definitionsDir = path.join(tempDirectory, "definitions");
      const entries = await fs.readdir(definitionsDir);
      expect(entries.some((name) => name.endsWith(".tmp"))).toBe(false);
      expect(entries.some((name) => name.endsWith(".md"))).toBe(true);
    });

    it("rejects path traversal in the filenameHint", async () => {
      const store = createStore();
      await expect(store.install(NIA_V1_FIXTURE, { filenameHint: "../../etc/evil.md" })).rejects.toThrow(
        NiaDefinitionStoreError,
      );
      try {
        await store.install(NIA_V1_FIXTURE, { filenameHint: "../../etc/evil.md" });
      } catch (error) {
        expect((error as InstanceType<typeof NiaDefinitionStoreError>).code).toBe("PATH_TRAVERSAL_REJECTED");
      }
    });

    it("rejects path traversal in an explicit id (via the packaged contract)", async () => {
      const store = createStore();
      const source = "---\nnia: v1\nid: \"../../etc/passwd\"\ndescription: d\nscope: selection\n---\n\nBody.\n";
      await expect(store.install(source, { filenameHint: "whatever.md" })).rejects.toThrow(NiaDefinitionError);
    });

    it("rejects an invalid definition", async () => {
      const store = createStore();
      await expect(store.install("not a definition at all", { filenameHint: "bad.md" })).rejects.toThrow(
        NiaDefinitionError,
      );
    });

    it("rejects a non-string source (renderer-normalized object) outright", async () => {
      const store = createStore();
      await expect(
        store.install({ source: NIA_V1_FIXTURE, ast: { forged: true } } as unknown as string, {
          filenameHint: "forged.md",
        }),
      ).rejects.toThrow(NiaDefinitionError);
    });

    it("requires a filenameHint when the definition has no explicit id", async () => {
      const store = createStore();
      await expect(store.install(NIA_V1_FIXTURE, {})).rejects.toThrow(NiaDefinitionStoreError);
    });

    it("rejects a duplicate install with the same canonical identity", async () => {
      const store = createStore();
      await store.install(NIA_V1_FIXTURE, { filenameHint: "dup.md" });
      await expect(store.install(NIA_V1_FIXTURE, { filenameHint: "dup.md" })).rejects.toThrow(
        NiaDefinitionStoreError,
      );
      try {
        await store.install(NIA_V1_FIXTURE, { filenameHint: "dup.md" });
      } catch (error) {
        expect((error as InstanceType<typeof NiaDefinitionStoreError>).code).toBe("DEFINITION_CONFLICT");
      }
    });

    it("rejects installing over a built-in name", async () => {
      const store = createStore([{ name: "improve-clarity", source: BUILT_IN_NIA_DEFINITIONS[0].source }]);
      const source = NIA_V1_FIXTURE.replace("nia: v1\n", "nia: v1\nid: improve-clarity\n");
      await expect(store.install(source, { filenameHint: "ignored.md" })).rejects.toThrow(NiaDefinitionStoreError);
      try {
        await store.install(source, { filenameHint: "ignored.md" });
      } catch (error) {
        expect((error as InstanceType<typeof NiaDefinitionStoreError>).code).toBe("BUILTIN_PROTECTED");
      }
    });
  });

  describe("collision detection", () => {
    it("rejects a canonical install colliding with an already-installed legacy alias", async () => {
      const store = createStore();
      await store.install(GENIE_V1_FIXTURE, { filenameHint: "improve.md" });
      await expect(store.install(NIA_V1_FIXTURE, { filenameHint: "improve.md" })).rejects.toThrow(
        NiaDefinitionStoreError,
      );
    });

    it("rejects a built-in vs. user-installed collision", async () => {
      const store = createStore([{ name: "shared-name", source: BUILT_IN_NIA_DEFINITIONS[0].source.replace("id: improve-clarity", "id: shared-name") }]);
      // GENIE_V1_FIXTURE has no explicit id, so its canonical identity comes
      // from the filenameHint and must still collide with the built-in.
      await expect(store.install(GENIE_V1_FIXTURE, { filenameHint: "shared-name.md" })).rejects.toThrow(
        NiaDefinitionStoreError,
      );
    });

    it("collides two names that differ only by case", async () => {
      const store = createStore();
      await store.install(NIA_V1_FIXTURE, { filenameHint: "Improve-Text.md" });
      await expect(store.install(GENIE_V0_FIXTURE, { filenameHint: "improve-text.md" })).rejects.toThrow(
        NiaDefinitionStoreError,
      );
    });

    it("collides two names that differ only by Unicode normalization form", async () => {
      const store = createStore();
      const precomposed = "cafe\u0301-note.md"; // "e" + combining acute accent
      const decomposed = "caf\u00e9-note.md"; // precomposed "é"
      await store.install(NIA_V1_FIXTURE, { filenameHint: precomposed });
      await expect(store.install(GENIE_V1_FIXTURE, { filenameHint: decomposed })).rejects.toThrow(
        NiaDefinitionStoreError,
      );
    });

    it("collides two legacy files (genie v1 and genie v0) that normalize to the same id", async () => {
      const store = createStore();
      await store.install(GENIE_V1_FIXTURE, { filenameHint: "shared.md" });
      await expect(store.install(GENIE_V0_FIXTURE, { filenameHint: "SHARED.MD" })).rejects.toThrow(
        NiaDefinitionStoreError,
      );
      try {
        await store.install(GENIE_V0_FIXTURE, { filenameHint: "SHARED.MD" });
      } catch (error) {
        expect((error as InstanceType<typeof NiaDefinitionStoreError>).code).toBe("DEFINITION_CONFLICT");
      }
    });
  });

  describe("uninstall", () => {
    it("uninstalls an installed definition by canonical identity, including case-insensitively", async () => {
      const store = createStore();
      await store.install(NIA_V1_FIXTURE, { filenameHint: "improve-text.md" });
      const result = await store.uninstall("Improve-Text");
      expect(result).toEqual({ canonicalId: "improve-text", uninstalled: true });
      expect(await store.get("improve-text")).toBeNull();
      const list = await store.list();
      expect(list.map((entry: { canonicalId: string }) => entry.canonicalId)).not.toContain("improve-text");
    });

    it("removes the definition file from disk", async () => {
      const store = createStore();
      await store.install(NIA_V1_FIXTURE, { filenameHint: "improve-text.md" });
      const definitionsDir = path.join(tempDirectory, "definitions");
      const before = await fs.readdir(definitionsDir);
      expect(before.length).toBe(1);
      await store.uninstall("improve-text");
      const after = await fs.readdir(definitionsDir);
      expect(after.length).toBe(0);
    });

    it("rejects uninstalling an unknown definition", async () => {
      const store = createStore();
      await expect(store.uninstall("does-not-exist")).rejects.toThrow(NiaDefinitionStoreError);
      try {
        await store.uninstall("does-not-exist");
      } catch (error) {
        expect((error as InstanceType<typeof NiaDefinitionStoreError>).code).toBe("NOT_FOUND");
      }
    });

    it("rejects uninstalling a built-in definition", async () => {
      const store = createStore([{ name: "improve-clarity", source: BUILT_IN_NIA_DEFINITIONS[0].source }]);
      await expect(store.uninstall("improve-clarity")).rejects.toThrow(NiaDefinitionStoreError);
      try {
        await store.uninstall("improve-clarity");
      } catch (error) {
        expect((error as InstanceType<typeof NiaDefinitionStoreError>).code).toBe("BUILTIN_PROTECTED");
      }
    });
  });

  describe("exportCanonical", () => {
    it("exports an installed legacy genie: v1 definition as canonical nia: v1 only", async () => {
      const store = createStore();
      await store.install(GENIE_V1_FIXTURE, { filenameHint: "improve.md" });
      const exported: string = await store.exportCanonical("improve");
      expect(exported.startsWith("---\nnia: v1\n")).toBe(true);
      expect(exported).not.toContain("genie:");
      expect(exported).not.toContain("sourceCompatibility");
      expect(exported).not.toContain("diagnostics");
    });

    it("exports an installed unversioned legacy genie: v0 definition as canonical nia: v1 only", async () => {
      const store = createStore();
      await store.install(GENIE_V0_FIXTURE, { filenameHint: "improve-v0.md" });
      const exported: string = await store.exportCanonical("improve-v0");
      expect(exported.startsWith("---\nnia: v1\n")).toBe(true);
      expect(exported).not.toContain("genie:");
    });

    it("exports a built-in definition as canonical nia: v1", async () => {
      const store = createStore([{ name: "improve-clarity", source: BUILT_IN_NIA_DEFINITIONS[0].source }]);
      const exported: string = await store.exportCanonical("improve-clarity");
      expect(exported.startsWith("---\nnia: v1\n")).toBe(true);
    });

    it("exports via a legacy genie/<name> uses ref and still produces canonical nia: v1", async () => {
      const store = createStore();
      await store.install(GENIE_V1_FIXTURE, { filenameHint: "improve.md" });
      const exported: string = await store.exportCanonical("genie/improve");
      expect(exported.startsWith("---\nnia: v1\n")).toBe(true);
      expect(exported).not.toContain("genie:");
    });

    it("rejects exporting an unknown definition", async () => {
      const store = createStore();
      await expect(store.exportCanonical("does-not-exist")).rejects.toThrow(NiaDefinitionStoreError);
    });
  });

  describe("resolveUsesRef: workflow graph lookup never emits a new genie/* reference", () => {
    it("resolves a canonical uses: nia/<name> reference", async () => {
      const store = createStore();
      await store.install(NIA_V1_FIXTURE, { filenameHint: "improve-text.md" });
      const resolution = await store.resolveUsesRef("nia/improve-text");
      expect(resolution.ref).toEqual({ family: "nia", name: "improve-text", sourceCompatibility: "canonical" });
      expect(resolution.label).toBe("Nia");
    });

    it("resolves a legacy uses: genie/<name> reference to the nia family", async () => {
      const store = createStore();
      await store.install(GENIE_V1_FIXTURE, { filenameHint: "improve.md" });
      const resolution = await store.resolveUsesRef("genie/improve");
      expect(resolution.ref.family).toBe("nia");
      expect(resolution.ref.sourceCompatibility).toBe("legacy_genie");
      expect(resolution.label).toBe("Nia");
      // The underlying stored source's own compatibility is retained only as
      // diagnostic metadata, distinct from the always-"nia" ref family.
      expect(resolution.sourceCompatibility).toBe("legacy_genie_v1");
    });

    it("rejects resolving an unknown definition reference", async () => {
      const store = createStore();
      await expect(store.resolveUsesRef("nia/does-not-exist")).rejects.toThrow(NiaDefinitionStoreError);
      try {
        await store.resolveUsesRef("nia/does-not-exist");
      } catch (error) {
        expect((error as InstanceType<typeof NiaDefinitionStoreError>).code).toBe("NOT_FOUND");
      }
    });

    it("rejects a forged/malformed uses reference before any lookup", async () => {
      const store = createStore();
      await expect(store.resolveUsesRef("nia/../../etc/passwd")).rejects.toThrow();
      await expect(store.resolveUsesRef("acme/improve")).rejects.toThrow();
    });
  });

  describe("filesystem isolation via injected baseDir", () => {
    it("keeps two stores pointed at different baseDirs fully isolated", async () => {
      const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "auris-nia-store-other-"));
      try {
        const storeA = createNiaDefinitionStore({ baseDir: tempDirectory });
        const storeB = createNiaDefinitionStore({ baseDir: otherDir });
        await storeA.install(NIA_V1_FIXTURE, { filenameHint: "only-in-a.md" });
        expect(await storeA.get("only-in-a")).toBeTruthy();
        expect(await storeB.get("only-in-a")).toBeNull();
      } finally {
        await fs.rm(otherDir, { force: true, recursive: true });
      }
    });
  });
});
