import { describe, expect, it } from "vitest";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { buildMarkdownIndex } from "@/features/notes/documents/markdown-index";
import {
  RELATION_KEYS,
  buildRelationshipGraph,
} from "@/features/notes/graph/relationship-graph";

function doc(
  path: string,
  source: string,
  frontmatter: Record<string, unknown> = {},
): NoteDocument {
  const parsed = buildMarkdownIndex(source);
  const fileName = path.slice(path.lastIndexOf("/") + 1);

  return {
    basename: fileName.replace(/\.md$/u, ""),
    fileName,
    frontmatter,
    mtime: null,
    parsed: {
      ...parsed,
      tags: [
        ...parsed.tags,
        ...(Array.isArray(frontmatter.tags)
          ? frontmatter.tags.filter((tag): tag is string => typeof tag === "string")
          : []),
      ],
    },
    path,
    rawSource: source,
  };
}

describe("buildRelationshipGraph", () => {
  it("creates one doc node per document, labelled by basename", () => {
    const graph = buildRelationshipGraph([
      doc("a.md", "# Alpha"),
      doc("nested/b.md", "# Beta"),
    ]);

    const docNodes = graph.nodes.filter((node) => node.type === "doc");
    expect(docNodes.map((node) => node.id).sort()).toEqual(["a.md", "nested/b.md"]);
    expect(docNodes.find((node) => node.id === "nested/b.md")?.label).toBe("b");
  });

  it("prefers the note title over the basename for display", () => {
    const graph = buildRelationshipGraph([doc("a.md", "# Alpha Note")]);

    expect(graph.nodes[0].title).toBe("Alpha Note");
    expect(graph.nodes[0].label).toBe("a");
  });

  it("prefers a frontmatter title over the H1 heading", () => {
    const graph = buildRelationshipGraph([
      doc("a.md", "# Heading Title", { title: "Frontmatter Title" }),
    ]);

    expect(graph.nodes[0].title).toBe("Frontmatter Title");
  });

  it("emits a wikiLink edge for a resolvable [[target]]", () => {
    const graph = buildRelationshipGraph([
      doc("a.md", "# A\n\nsee [[b]]"),
      doc("b.md", "# B"),
    ]);

    expect(graph.edges).toEqual([{ from: "a.md", kind: "wikiLink", to: "b.md" }]);
  });

  it("marks an unresolvable wiki target as an unresolved node and edge", () => {
    const graph = buildRelationshipGraph([doc("a.md", "# A\n\nsee [[ghost]]")]);

    const ghost = graph.nodes.find((node) => node.id === "[[ghost]]");
    expect(ghost).toMatchObject({ label: "[[ghost]]", type: "doc", unresolved: true });
    expect(graph.edges).toEqual([
      { from: "a.md", kind: "wikiLink", to: "[[ghost]]", unresolved: true },
    ]);
  });

  it("distinguishes a markdown link from a wiki link by edge kind", () => {
    const graph = buildRelationshipGraph([
      doc("a.md", "# A\n\n[to b](b.md)"),
      doc("b.md", "# B"),
    ]);

    expect(graph.edges).toEqual([{ from: "a.md", kind: "link", to: "b.md" }]);
  });

  it("creates a shared tag node that several docs point at", () => {
    const graph = buildRelationshipGraph([
      doc("a.md", "# A\n\n#shared"),
      doc("b.md", "# B\n\n#shared"),
    ]);

    expect(graph.nodes.filter((node) => node.type === "tag")).toEqual([
      { id: "#shared", label: "#shared", type: "tag" },
    ]);
    expect(graph.edges.filter((edge) => edge.kind === "tag")).toHaveLength(2);
  });

  it("normalizes tag case so #Shared and #shared are one node", () => {
    const graph = buildRelationshipGraph([
      doc("a.md", "# A\n\n#Shared"),
      doc("b.md", "# B\n\n#shared"),
    ]);

    expect(graph.nodes.filter((node) => node.type === "tag")).toHaveLength(1);
  });

  it("supports CJK tags that only frontmatter can express", () => {
    const graph = buildRelationshipGraph([doc("a.md", "# A", { tags: ["笔记"] })]);

    expect(graph.nodes.find((node) => node.type === "tag")?.id).toBe("#笔记");
  });

  it("emits relation edges from every supported frontmatter key", () => {
    const docs = [
      doc("a.md", "# A", Object.fromEntries(RELATION_KEYS.map((key) => [key, "b"]))),
      doc("b.md", "# B"),
    ];
    const graph = buildRelationshipGraph(docs);

    const relationKeys = graph.edges
      .filter((edge) => edge.kind === "relation")
      .map((edge) => edge.relationKey)
      .sort();
    expect(relationKeys).toEqual([...RELATION_KEYS].sort());
  });

  it("keeps a relation and a wikiLink to the same target as separate edges", () => {
    const graph = buildRelationshipGraph([
      doc("a.md", "# A\n\n[[b]]", { up: "b" }),
      doc("b.md", "# B"),
    ]);

    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.map((edge) => edge.kind).sort()).toEqual(["relation", "wikiLink"]);
  });

  it("de-duplicates repeated identical references", () => {
    const graph = buildRelationshipGraph([
      doc("a.md", "# A\n\n[[b]] and again [[b]]"),
      doc("b.md", "# B"),
    ]);

    expect(graph.edges).toHaveLength(1);
  });

  it("drops self-references so a note never links to itself", () => {
    const graph = buildRelationshipGraph([doc("a.md", "# A\n\n[[a]]")]);

    expect(graph.edges).toHaveLength(0);
  });

  it("resolves a wiki target through a frontmatter alias", () => {
    const graph = buildRelationshipGraph([
      doc("a.md", "# A\n\n[[Bee]]"),
      doc("b.md", "# B", { aliases: ["Bee"] }),
    ]);

    expect(graph.edges).toEqual([{ from: "a.md", kind: "wikiLink", to: "b.md" }]);
  });

  it("returns an empty graph for no documents", () => {
    expect(buildRelationshipGraph([])).toEqual({ edges: [], nodes: [] });
  });
});
