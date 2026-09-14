/**
 * dagre → xyflow 转换层测试。
 *
 * 用例集合对齐 vmark `src/components/KnowledgeBasePanel/graphToFlow.test.ts`
 * （节点/位置、title 优先、tag 与 unresolved 的类名、悬空边丢弃、kind 驱动
 * 边类名 + relation 动画），并补了 auris 侧新增的两条：节点携带原始 type/
 * unresolved 供点击回调判定，以及居中位移的正确性。
 */

import { describe, expect, it } from "vitest";
import { graphToFlow } from "@/features/notes/graph/graph-to-flow";
import type { RelationshipGraph } from "@/features/notes/graph/relationship-graph";

const graph: RelationshipGraph = {
  nodes: [
    { id: "A.md", label: "A", title: "Note A", type: "doc" },
    { id: "B.md", label: "B", type: "doc" },
    { id: "#tag", label: "#tag", type: "tag" },
    { id: "[[Ghost]]", label: "[[Ghost]]", type: "doc", unresolved: true },
  ],
  edges: [
    { from: "A.md", kind: "wikiLink", to: "B.md" },
    { from: "A.md", kind: "tag", to: "#tag" },
    { from: "A.md", kind: "wikiLink", to: "[[Ghost]]", unresolved: true },
    // 悬空：missing.md 不在 nodes 里 → 应被丢弃
    { from: "A.md", kind: "link", to: "missing.md" },
  ],
};

describe("graphToFlow", () => {
  it("maps every node and assigns numeric positions", () => {
    const flow = graphToFlow(graph);

    expect(flow.nodes).toHaveLength(4);
    for (const node of flow.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it("uses the title as the label when present, else the label", () => {
    const flow = graphToFlow(graph);

    expect(flow.nodes.find((node) => node.id === "A.md")?.data.label).toBe("Note A");
    expect(flow.nodes.find((node) => node.id === "B.md")?.data.label).toBe("B");
  });

  it("gives tag and unresolved nodes distinguishing classes", () => {
    const flow = graphToFlow(graph);

    expect(flow.nodes.find((node) => node.id === "#tag")?.className).toContain(
      "notes-graph-node--tag",
    );
    expect(flow.nodes.find((node) => node.id === "[[Ghost]]")?.className).toContain(
      "notes-graph-node--unresolved",
    );
    expect(flow.nodes.find((node) => node.id === "A.md")?.className).toContain(
      "notes-graph-node--doc",
    );
  });

  it("drops edges whose endpoints are not nodes", () => {
    const flow = graphToFlow(graph);

    // 4 条进，missing.md 那条悬空被丢 → 3 条
    expect(flow.edges).toHaveLength(3);
    expect(flow.edges.every((edge) => Boolean(edge.source) && Boolean(edge.target))).toBe(true);
    expect(flow.edges.some((edge) => edge.target === "missing.md")).toBe(false);
  });

  it("lets kind drive the edge class and animates relations", () => {
    const flow = graphToFlow({
      nodes: [
        { id: "x", label: "x", type: "doc" },
        { id: "y", label: "y", type: "doc" },
      ],
      edges: [{ from: "x", kind: "relation", relationKey: "up", to: "y" }],
    });

    expect(flow.edges[0].className).toContain("notes-graph-edge--relation");
    expect(flow.edges[0].animated).toBe(true);
  });

  it("does not animate non-relation edges", () => {
    const flow = graphToFlow(graph);

    for (const edge of flow.edges) {
      expect(edge.animated).toBe(false);
    }
  });

  it("carries node type and unresolved through to data for click handling", () => {
    const flow = graphToFlow(graph);
    const ghost = flow.nodes.find((node) => node.id === "[[Ghost]]");
    const tag = flow.nodes.find((node) => node.id === "#tag");

    // 点击回调要能区分「打开这篇笔记」和「这是标签/不存在的目标」，
    // 所以判定信息必须随节点带过去，而不是在视图层靠 id 前缀猜。
    expect(ghost?.data.unresolved).toBe(true);
    expect(ghost?.data.nodeType).toBe("doc");
    expect(tag?.data.nodeType).toBe("tag");
    expect(flow.nodes.find((node) => node.id === "A.md")?.data.unresolved).toBe(false);
  });

  it("offsets positions so dagre centres become top-left corners", () => {
    const flow = graphToFlow({
      nodes: [{ id: "solo.md", label: "solo", type: "doc" }],
      edges: [],
    });

    // dagre 给的是中心点，xyflow 要左上角。单节点时中心 = (w/2, h/2)，
    // 所以位移后必须是 (0, 0)——不减这一半，整张图会朝右下偏半个节点。
    expect(flow.nodes[0].position.x).toBe(0);
    expect(flow.nodes[0].position.y).toBe(0);
  });

  it("produces unique edge ids even for parallel edges of different kinds", () => {
    const flow = graphToFlow({
      nodes: [
        { id: "a.md", label: "a", type: "doc" },
        { id: "b.md", label: "b", type: "doc" },
      ],
      edges: [
        { from: "a.md", kind: "wikiLink", to: "b.md" },
        { from: "a.md", kind: "relation", relationKey: "up", to: "b.md" },
      ],
    });

    const ids = flow.edges.map((edge) => edge.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns an empty flow for an empty graph", () => {
    const flow = graphToFlow({ nodes: [], edges: [] });

    expect(flow.nodes).toEqual([]);
    expect(flow.edges).toEqual([]);
  });
});
