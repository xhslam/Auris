"use client";

/**
 * 关系图画布（xyflow）。
 *
 * 单独成文件是为了让 `@xyflow/react` + `@dagrejs/dagre` 落在独立 chunk 里，由
 * `notes-graph-panel.tsx` 懒加载。vmark 在 `KnowledgeBasePanel.tsx` 里用
 * `React.lazy` 做同一件事，注释写明了原因：xyflow 与 dagre、以及 xyflow 的 d3
 * 依赖会和 mermaid 打进同一个 chunk，静态引入会给每个文档窗口的冷启动加上
 * ~3.2MB。auris 这边同理——笔记工作台常驻，图谱是按需打开的侧栏模式。
 *
 * 边界位置也照 vmark 的结论：懒加载边界包在「已挂载面板内部、直接裹住图」，
 * 不上提到面板外层。vmark 的 `WorkflowCanvas.tsx` 记录过 React 19 + xyflow 的
 * `disappearLayoutEffects` 循环，成因是边界放在了面板挂载层级。
 *
 * @module components/notes-v2/notes-graph-canvas
 */

import { useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { graphToFlow } from "@/features/notes/graph/graph-to-flow";
import type { RelationshipGraph } from "@/features/notes/graph/relationship-graph";

export type NotesGraphCanvasProps = {
  graph: RelationshipGraph;
  onOpenPath?: (path: string) => void;
};

export function NotesGraphCanvas({ graph, onOpenPath }: NotesGraphCanvasProps) {
  // 布局是纯计算且不便宜（dagre 要跑一遍）。图对象只在文档集合变化时才换引用，
  // 所以按引用 memo 就够，不必再深比较。
  const flow = useMemo(() => graphToFlow(graph), [graph]);

  const handleNodeClick: NodeMouseHandler<Node> = (_event, node) => {
    // 只有解析得到真实文件的 doc 节点才带 path。标签节点和未解析目标带的是
    // null，点击不做任何事——不能拿 id 当路径去打开一个磁盘上不存在的文件。
    const path = node.data?.path;
    if (typeof path === "string" && path) {
      onOpenPath?.(path);
    }
  };

  return (
    <div className="notes-v2__graph-canvas" data-testid="notes-graph-canvas">
      <ReactFlow
        edges={flow.edges}
        fitView
        nodes={flow.nodes}
        nodesConnectable={false}
        nodesDraggable
        onNodeClick={handleNodeClick}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
