"use client";

/**
 * 关系图面板（右侧栏 graph 模式）。
 *
 * 对齐 vmark `KnowledgeBasePanel` 的职责划分：面板负责状态与控件，图本身在
 * 懒加载边界内。两处按 auris 现实做的调整：
 *
 * 1. **没有 content server 生命周期**。vmark 的面板要渲染 stopped /
 *    provisioning / starting / running / error 五种状态，因为它的图数据来自一个
 *    需要下载 sidecar、起 loopback server 的进程；`getKbGraph` 是 Rust 代理的
 *    HTTP 请求。auris 的图直接由已经在内存里的 vault 文档算出来，没有这条链，
 *    所以那五个状态在这里没有对应物——不是省略，是不存在的东西不该假装存在。
 *    同理也没有 "在浏览器中打开" / iframe 站点视图。
 *
 * 2. **多了范围控制**。vmark 的图是整工作区，铺在编辑器右侧的 in-flow dock 里。
 *    auris 的右侧栏默认 320px 宽，把几百个节点铺进去等于什么都看不见。所以默认
 *    只画当前笔记的邻域（可调深度），并给出「整库」选项。这是宽度约束下的必要
 *    设计，不是功能缩水：整库视图仍然一键可达。
 *
 * @module components/notes-v2/notes-graph-panel
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import {
  buildRelationshipGraph,
  extractNeighbourhood,
  filterGraphNodeTypes,
  summarizeGraph,
} from "@/features/notes/graph/relationship-graph";

const NotesGraphCanvas = dynamic(
  () =>
    import("@/components/notes-v2/notes-graph-canvas").then(
      (module) => module.NotesGraphCanvas,
    ),
  {
    // 加载中占位与图自身的 loading 用同一个类，chunk 加载和布局计算读起来是一段
    // 连续的状态，而不是先闪一个空框再闪一次。
    loading: () => (
      <div className="notes-v2__graph-pending" data-testid="notes-graph-pending" />
    ),
    ssr: false,
  },
);

const DEPTH_OPTIONS = [1, 2, 3] as const;

type GraphScope = "local" | "vault";

export type NotesGraphPanelProps = {
  activePath: string | null;
  documents: NoteDocument[];
  onEnsureDocuments?: () => Promise<void>;
  onOpenPath?: (path: string) => void;
};

export function NotesGraphPanel({
  activePath,
  documents,
  onEnsureDocuments,
  onOpenPath,
}: NotesGraphPanelProps) {
  const [scope, setScope] = useState<GraphScope>("local");
  const [depth, setDepth] = useState<number>(1);
  const [showTags, setShowTags] = useState(true);
  const [isPreparing, setIsPreparing] = useState(Boolean(onEnsureDocuments));
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!onEnsureDocuments) {
      setIsPreparing(false);
      return undefined;
    }

    let active = true;
    setLoadError(null);
    setIsPreparing(true);
    void onEnsureDocuments()
      .catch((cause) => {
        if (active) {
          setLoadError(
            cause instanceof Error
              ? cause.message
              : NOTES_UI_COPY.errors.loadVault,
          );
        }
      })
      .finally(() => {
        if (active) setIsPreparing(false);
      });
    return () => {
      active = false;
    };
  }, [onEnsureDocuments]);

  // 全库图只依赖文档集合，先算一次；范围/标签过滤在它之上做，切换控件不必重建。
  const fullGraph = useMemo(() => buildRelationshipGraph(documents), [documents]);

  const graph = useMemo(() => {
    const scoped =
      scope === "local" && activePath
        ? extractNeighbourhood(fullGraph, activePath, depth)
        : fullGraph;
    return showTags ? scoped : filterGraphNodeTypes(scoped, ["doc"]);
  }, [activePath, depth, fullGraph, scope, showTags]);

  const summary = useMemo(() => summarizeGraph(graph), [graph]);
  const isLocalScopeUnavailable = scope === "local" && !activePath;

  return (
    <section
      aria-label={NOTES_UI_COPY.panels.graph.title}
      className="notes-v2__panel notes-v2__panel--graph"
    >
      <div className="notes-v2__graph-toolbar">
        <div className="notes-v2__graph-scope" role="group" aria-label={NOTES_UI_COPY.panels.graph.scopeLabel}>
          <button
            aria-pressed={scope === "local"}
            className="notes-v2__graph-chip"
            data-active={scope === "local" ? "true" : "false"}
            onClick={() => setScope("local")}
            type="button"
          >
            {NOTES_UI_COPY.panels.graph.scopeLocal}
          </button>
          <button
            aria-pressed={scope === "vault"}
            className="notes-v2__graph-chip"
            data-active={scope === "vault" ? "true" : "false"}
            onClick={() => setScope("vault")}
            type="button"
          >
            {NOTES_UI_COPY.panels.graph.scopeVault}
          </button>
        </div>

        <label className="notes-v2__graph-depth">
          <span>{NOTES_UI_COPY.panels.graph.depthLabel}</span>
          <select
            disabled={scope !== "local"}
            onChange={(event) => setDepth(Number(event.target.value))}
            value={depth}
          >
            {DEPTH_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button
          aria-pressed={showTags}
          className="notes-v2__graph-chip"
          data-active={showTags ? "true" : "false"}
          onClick={() => setShowTags((current) => !current)}
          type="button"
        >
          {NOTES_UI_COPY.panels.graph.tagsToggle}
        </button>
      </div>

      {isPreparing ? (
        <div className="notes-v2__graph-pending" data-testid="notes-graph-pending" />
      ) : loadError ? (
        <p className="notes-v2__empty-copy" role="alert">{loadError}</p>
      ) : (
        <>
          <p className="notes-v2__graph-summary">
            {NOTES_UI_COPY.panels.graph.summary(summary.docCount, summary.tagCount, summary.edgeCount)}
            {summary.unresolvedCount > 0
              ? ` · ${NOTES_UI_COPY.panels.graph.unresolved(summary.unresolvedCount)}`
              : ""}
          </p>

          {documents.length === 0 ? (
            <p className="notes-v2__empty-copy">{NOTES_UI_COPY.panels.graph.emptyVault}</p>
          ) : isLocalScopeUnavailable ? (
            <p className="notes-v2__empty-copy">{NOTES_UI_COPY.panels.graph.emptyNoActive}</p>
          ) : graph.nodes.length === 0 ? (
            <p className="notes-v2__empty-copy">{NOTES_UI_COPY.panels.graph.emptyIsolated}</p>
          ) : (
            <NotesGraphCanvas graph={graph} onOpenPath={onOpenPath} />
          )}
        </>
      )}
    </section>
  );
}
