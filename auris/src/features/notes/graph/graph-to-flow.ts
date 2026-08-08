/**
 * 关系图 → xyflow 节点/边（dagre 布局）。
 *
 * 逐条移植 vmark `src/components/KnowledgeBasePanel/graphToFlow.ts`：同样的
 * 常量（NODE_W/NODE_H、rankdir LR、nodesep 24、ranksep 60）、同样的
 * className 约定、同样「只有两端都是已知节点的边才参与布局并渲染」。
 *
 * 保持纯函数（不 import React、不碰 store），所以布局与过滤规则可以直接单测——
 * vmark 的 `graphToFlow.test.ts` 也是这么测的。
 *
 * @module features/notes/graph/graph-to-flow
 */

import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { RelationshipGraph } from "@/features/notes/graph/relationship-graph";

const NODE_W = 160;
const NODE_H = 36;

export type FlowGraph = {
  nodes: Node[];
  edges: Edge[];
};

/** 左→右布局；标签节点与未解析节点带各自的 class。 */
export function graphToFlow(graph: RelationshipGraph): FlowGraph {
  const layout = new dagre.graphlib.Graph();
  layout.setDefaultEdgeLabel(() => ({}));
  layout.setGraph({ nodesep: 24, rankdir: "LR", ranksep: 60 });

  for (const node of graph.nodes) {
    layout.setNode(node.id, { height: NODE_H, width: NODE_W });
  }

  // 只有两端都存在的边参与布局。悬空边（指向未登记节点）既不布局也不渲染，
  // 否则 dagre 会为它凭空补出一个没有标签的幽灵节点。
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    if (ids.has(edge.from) && ids.has(edge.to)) {
      layout.setEdge(edge.from, edge.to);
    }
  }

  dagre.layout(layout);

  const nodes: Node[] = graph.nodes.map((node) => {
    const position = layout.node(node.id) as { x?: number; y?: number } | undefined;
    const className = [
      "notes-graph-node",
      `notes-graph-node--${node.type}`,
      node.unresolved ? "notes-graph-node--unresolved" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      className,
      // 点击回调要能区分「打开这篇笔记」「这是标签」「这是不存在的目标」。
      // 判定信息随节点带过去，而不是在视图层靠 id 前缀猜——真有一篇叫
      // `#foo.md` 的笔记时，前缀判定就会把它当成标签。
      //
      // `path` 只在**真实存在**的 doc 节点上有值：未解析节点的 id 是链接里写的
      // 目标（`[[Ghost]]`），拿它去 openPath 只会打开一个不存在的文件。
      data: {
        label: node.title ?? node.label,
        nodeType: node.type,
        path: node.type === "doc" && !node.unresolved ? node.id : null,
        unresolved: node.unresolved === true,
      },
      id: node.id,
      position: {
        x: (position?.x ?? 0) - NODE_W / 2,
        y: (position?.y ?? 0) - NODE_H / 2,
      },
    };
  });

  const edges: Edge[] = graph.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .map((edge, index) => ({
      animated: edge.kind === "relation",
      className: `notes-graph-edge notes-graph-edge--${edge.kind}`,
      id: `e${index}-${edge.from}-${edge.to}-${edge.kind}`,
      source: edge.from,
      target: edge.to,
    }));

  return { edges, nodes };
}
