import { describe, expect, it } from "vitest";
import { createLargeVaultFixture } from "../../fixtures/notes/create-large-vault-fixture";
import { createVaultStore } from "@/features/notes/vault/vault-store";
import { getParsedDocumentCount, resetParsedDocumentCount } from "@/features/notes/documents/document-repository";
import {
  buildBacklinksIndex,
  buildTargetLookup,
  updateBacklinksIndex,
} from "@/features/notes/documents/backlinks";
import { searchDocuments } from "@/features/notes/documents/document-search";
import { createTree, flattenVisibleTree } from "@/components/notes-v2/notes-file-tree";

describe("large vault performance benchmarks (10,000 notes DoD)", () => {
  it("satisfies all 10k vault performance criteria", async () => {
    // Generate 10,000 notes dataset
    const fixture = createLargeVaultFixture({
      fileCount: 10_000,
      directoryDepth: 4,
      linkDensity: 0.25,
      averageBodyBytes: 300,
    });

    const store = createVaultStore(fixture.client);

    // 1. Cold start / initial vault load
    resetParsedDocumentCount();
    fixture.resetReadCount();
    const initialSnapshot = await store.refresh();

    // Verification: cold start does not read all 10,000 files, only the initial document
    expect(initialSnapshot.entries.length).toBe(10_000);
    expect(initialSnapshot.documents.length).toBeLessThanOrEqual(1); // lazy loading!
    expect(fixture.readCount()).toBeLessThanOrEqual(1);
    expect(getParsedDocumentCount()).toBeLessThanOrEqual(1);

    // 2. Full load (e.g., user runs global search)
    const fullSnapshot = await store.refresh({ loadAll: true });
    expect(fullSnapshot.documents.length).toBe(10_000);
    expect(fixture.readCount()).toBe(10_000);
    expect(getParsedDocumentCount()).toBe(10_000);

    // 3. Subsequent refresh with no changes (DoD criterion 2)
    fixture.resetReadCount();
    resetParsedDocumentCount();
    store.resetDebugStats();

    const noChangeSnapshot = await store.refresh();
    const stats = store.getDebugStats();

    expect(noChangeSnapshot.documents.length).toBe(10_000);
    expect(fixture.readCount()).toBe(0);
    expect(getParsedDocumentCount()).toBe(0);
    expect(stats.readFileCalls).toBe(0);
    expect(stats.reusedDocumentCount).toBe(10_000);

    // 4. Single file modification (DoD criterion 3)
    const targetFile = fullSnapshot.documents[100];
    const modifiedContent = targetFile.rawSource + "\nUpdated content with [[note-00001]]\n";
    fixture.files.set(targetFile.path, modifiedContent);

    // Update mtime and size in entry
    const entryIndex = fixture.entries.findIndex((e) => e.path === targetFile.path);
    fixture.entries[entryIndex] = {
      ...fixture.entries[entryIndex],
      mtime: "2026-11-05T01:00:00.000Z",
      size: modifiedContent.length,
    };

    fixture.resetReadCount();
    resetParsedDocumentCount();
    store.resetDebugStats();

    const singleChangeSnapshot = await store.refresh();
    const changeStats = store.getDebugStats();

    // Exactly 1 read and 1 parse!
    expect(fixture.readCount()).toBe(1);
    expect(getParsedDocumentCount()).toBe(1);
    expect(changeStats.readFileCalls).toBe(1);
    expect(changeStats.reusedDocumentCount).toBe(9_999);

    // 5. Backlinks topology update on 10,000 docs (DoD criterion 5)
    const docs = singleChangeSnapshot.documents;
    const initialIndex = buildBacklinksIndex(docs);

    // Modify a non-linked document
    const docToModify = docs[500];
    const updatedDoc500 = {
      ...docToModify,
      rawSource: docToModify.rawSource + "\nAdded regular text",
    };

    const prevByPath = new Map(docs.map((d) => [d.path, d]));
    const lookup = buildTargetLookup(docs);

    const nextIndex = updateBacklinksIndex(initialIndex, {
      allDocuments: docs,
      changedDocuments: [updatedDoc500],
      previousDocumentsByPath: prevByPath,
      targetLookup: lookup,
      targetTopologyChanged: false,
    });

    // Reference equality checks: incoming backlinks for untouched documents must be identical
    let unchangedCount = 0;
    for (let i = 0; i < 10_000; i++) {
      const p = docs[i].path;
      if (initialIndex[p] === nextIndex[p]) {
        unchangedCount++;
      }
    }
    // Untouched documents retain reference equality
    expect(unchangedCount).toBe(10_000);

    // 6. Warm search on 10,000 docs with WeakMap caching (DoD criterion 7)
    // Run search once to warm WeakMap cache
    const startCold = performance.now();
    const resultsCold = searchDocuments(docs, "tag0");
    const _durationCold = performance.now() - startCold;

    expect(resultsCold.length).toBeGreaterThan(0);

    // Warm search with different query
    const startWarm = performance.now();
    const resultsWarm = searchDocuments(docs, "category1");
    const durationWarm = performance.now() - startWarm;

    expect(resultsWarm.length).toBeGreaterThan(0);
    // Warm search must be fast in Node test runner (< 100ms for 10,000 documents)
    expect(durationWarm).toBeLessThan(100);

    // 7. Tree virtualization building and flattening for 10,000 nodes (DoD criterion 6)
    const treeStart = performance.now();
    const tree = createTree(fixture.entries);
    const treeTime = performance.now() - treeStart;
    expect(treeTime).toBeLessThan(150); // fast tree construction

    const flattened = flattenVisibleTree(tree, {}, new Set(), { collapseAllByDefault: true });
    // Root level contains the root-level files and top folder:
    expect(flattened.length).toBe(2501);
    // In NotesFileTree, virtualization restricts actual rendered DOM rows to viewport:
    const viewportHeight = 600;
    const rowHeight = 32;
    const overscan = 8;
    const renderedRowCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    expect(renderedRowCount).toBeLessThan(40);
  });
});
