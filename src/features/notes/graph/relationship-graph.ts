/**
 * 笔记关系图（数据层）。
 *
 * 移植 vmark `server/content/src/index/buildIndex.ts#buildGraph` 与
 * `index/types.ts` 的图语义：doc/tag 两类节点，link/wikiLink/tag/relation 四类
 * 有向边，未解析目标单独成节点并标 `unresolved`，同一 (from,to,kind,relationKey)
 * 只留一条边。
 *
 * 与 vmark 的两处结构差异，都是架构差异而不是省略：
 *
 * 1. **不落地 vmark 的 `WikiResolver`**。vmark 的 content server 是独立 Node 进程，
 *    只能看到磁盘，所以必须自带一套 basename/relpath 反向索引。Auris 的解析器
 *    (`documents/backlinks.ts`) 已经在做同一件事，而且比 vmark 那版更全——除了
 *    路径与 basename，还认前言 `aliases` 和文档标题。再抄一份 vmark 的
 *    resolver 会造出第二套解析规则，wiki 链接在图里和在正文里跳到不同的笔记。
 * 2. **wikiLink 与 link 需要重新提取**。auris 的 `parsed.links` 把 `[[wiki]]` 和
 *    `[a](b.md)` 合并进同一个数组，边的 kind 就分不出来了。所以这里从 rawSource
 *    分别再取一次——两个提取器都是导出的纯函数，不是重写解析。
 *
 * @module features/notes/graph/relationship-graph
 */

import { createBacklinkTargetResolver } from "@/features/notes/documents/backlinks";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import {
  extractMarkdownNoteLinks,
  extractWikiLinks,
} from "@/features/notes/documents/wiki-links";
import { getVaultBasename } from "@/features/notes/vault/vault-path";

/** 边的类型。与 vmark `index/types.ts` 的 `EdgeKind` 同名同义。 */
export type GraphEdgeKind = "link" | "wikiLink" | "tag" | "relation";

export type GraphNode = {
  /** 文档节点用 vault 相对路径；标签节点用 `#tag`；未解析目标保留原始写法。 */
  id: string;
  type: "doc" | "tag";
  label: string;
  /** 文档标题（前言 title 优先，其次 H1）。 */
  title?: string;
  /** 被引用但没有对应文件时为 true。 */
  unresolved?: boolean;
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  /** `relation` 边携带的前言键名（如 "up"、"related"）。 */
  relationKey?: string;
  unresolved?: boolean;
};

export type RelationshipGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/**
 * 当作「有类型关系」处理的前言键。取自 vmark plan §7 的默认集合，顺序也一并保留
 * （决定同一篇文档里 relation 边的产出顺序，测试据此断言）。
 */
export const RELATION_KEYS = ["related", "up", "links", "down", "next", "prev"] as const;

/** 把前言值压成一维字符串列表。对齐 vmark `index/extract.ts#toList`。 */
function toList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(toList);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  return [];
}

function documentTitle(document: NoteDocument): string | undefined {
  const frontmatterTitle = document.frontmatter.title;
  if (typeof frontmatterTitle === "string" && frontmatterTitle.trim()) {
    return frontmatterTitle.trim();
  }
  return document.parsed.title ?? undefined;
}

/**
 * 由文档集合构建关系图。
 *
 * 纯函数：不读磁盘、不碰 store，因此边的判定可以直接单测（CJK 标签、重复边、
 * 未解析目标、自引用）。
 */
export function buildRelationshipGraph(documents: NoteDocument[]): RelationshipGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seenEdge = new Set<string>();
  const resolveTarget = createBacklinkTargetResolver(documents);

  for (const document of documents) {
    nodes.set(document.path, {
      id: document.path,
      label: getVaultBasename(document.path) || document.fileName,
      type: "doc",
      ...(documentTitle(document) === undefined ? {} : { title: documentTitle(document) }),
    });
  }

  const addEdge = (edge: GraphEdge) => {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.kind}\u0000${edge.relationKey ?? ""}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    edges.push(edge);
  };

  /**
   * 标签节点的身份按大小写归一，显示仍用首次出现的写法。
   *
   * vmark 在 `index/extract.ts#normalizeTag` 里直接 `toLowerCase()`，因为它的图
   * 只需要身份、不回显原文。Auris 的 `parsed.tags` 保留首次出现的大小写（只在
   * **单篇文档内**大小写不敏感去重），所以 a.md 的 `#Shared` 与 b.md 的
   * `#shared` 会是两个不同字符串。若照搬字符串当 id，同一个标签会裂成两个节点，
   * 两篇本应共享标签的笔记在图上就断开了——而这恰好是图唯一要回答的问题。
   *
   * 归一到 lowercase 保证连通性；label 取首次出现的写法，避免把用户写的
   * `#TypeScript` 显示成 `#typescript`。
   */
  const ensureTagNode = (tag: string) => {
    const id = `#${tag.toLowerCase()}`;
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: `#${tag}`, type: "tag" });
    }
    return id;
  };

  const ensureUnresolvedNode = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: id, type: "doc", unresolved: true });
    }
  };

  for (const document of documents) {
    const source = document.rawSource ?? "";

    // wikiLink 与 link 分开取，才能保留两种 kind。parsed.links 是二者合并后的
    // 结果，用它建图会把所有边都渲染成同一种。
    const linkGroups: Array<{ kind: "wikiLink" | "link"; targets: string[] }> = [
      {
        kind: "wikiLink",
        targets: extractWikiLinks(source).map((link) => link.target),
      },
      {
        kind: "link",
        targets: extractMarkdownNoteLinks(source).map((link) => link.target),
      },
    ];

    for (const { kind, targets } of linkGroups) {
      for (const target of targets) {
        const resolved = resolveTarget(target, document.path);

        if (resolved) {
          // 自引用不成边：它在图里只是一个绕回自己的圈，不携带任何关系信息。
          if (resolved === document.path) continue;
          addEdge({ from: document.path, kind, to: resolved });
          continue;
        }

        const placeholderId = kind === "wikiLink" ? `[[${target}]]` : target;
        ensureUnresolvedNode(placeholderId);
        addEdge({ from: document.path, kind, to: placeholderId, unresolved: true });
      }
    }

    // parsed.tags 已经是「行内 #tag + 前言 tags」去重合并后的结果
    // （document-repository.mergeTags），所以这里不再重复提取。
    for (const tag of document.parsed.tags) {
      const tagId = ensureTagNode(tag);
      addEdge({ from: document.path, kind: "tag", to: tagId });
    }

    for (const key of RELATION_KEYS) {
      for (const rawTarget of toList(document.frontmatter[key])) {
        const resolved = resolveTarget(rawTarget, document.path);
        const to = resolved ?? `[[${rawTarget}]]`;

        if (resolved === document.path) continue;
        if (!resolved) ensureUnresolvedNode(to);

        addEdge({
          from: document.path,
          kind: "relation",
          relationKey: key,
          to,
          unresolved: !resolved,
        });
      }
    }
  }

  return { edges, nodes: [...nodes.values()] };
}

/** 图规模摘要，面板用来在渲染前给出「多少节点 / 多少边」。 */
export function summarizeGraph(graph: RelationshipGraph) {
  let docCount = 0;
  let tagCount = 0;
  let unresolvedCount = 0;

  for (const node of graph.nodes) {
    // 未解析节点单独计数，不混进 docCount：它们不是库里的笔记，把它们算成
    // 「N 篇笔记」会虚报库的规模。
    if (node.unresolved) unresolvedCount += 1;
    else if (node.type === "tag") tagCount += 1;
    else docCount += 1;
  }

  return { docCount, edgeCount: graph.edges.length, tagCount, unresolvedCount };
}

/**
 * 取某个节点的 N 跳邻域（无向）。
 *
 * 右侧栏默认 320px，整库图铺进去等于什么都看不清，所以默认只画当前笔记周围。
 * 遍历按无向处理：反链方向的邻居同样是「与这篇笔记相关」的东西，只顺着出边走
 * 会把引用了当前笔记的那些笔记全部漏掉，而那恰好是最该看到的一半。
 *
 * `depth <= 0` 时只返回中心节点本身（不含边），便于调用方表达「只看这一个」。
 * 中心节点不在图里时返回空图，而不是静默返回整库——否则用户会以为自己看的是
 * 邻域，实际看的是全部。
 */
export function extractNeighbourhood(
  graph: RelationshipGraph,
  centerId: string,
  depth: number,
): RelationshipGraph {
  if (!graph.nodes.some((node) => node.id === centerId)) {
    return { edges: [], nodes: [] };
  }

  const adjacency = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    const bucket = adjacency.get(from) ?? new Set<string>();
    bucket.add(to);
    adjacency.set(from, bucket);
  };

  for (const edge of graph.edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }

  const kept = new Set<string>([centerId]);
  let frontier = [centerId];

  for (let hop = 0; hop < Math.max(0, depth); hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (kept.has(neighbour)) continue;
        kept.add(neighbour);
        next.push(neighbour);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return {
    // 两端都在邻域内的边才保留：留下一条指向域外的半边，xyflow 会因为找不到
    // target 而丢弃它，dagre 却已经按它布过局，结果是一片莫名的空白。
    edges: graph.edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to)),
    nodes: graph.nodes.filter((node) => kept.has(node.id)),
  };
}

/** 只保留指定类型的节点，并丢掉悬空的边（关掉标签视图时用）。 */
export function filterGraphNodeTypes(
  graph: RelationshipGraph,
  types: readonly GraphNode["type"][],
): RelationshipGraph {
  const allowed = new Set(types);
  const nodes = graph.nodes.filter((node) => allowed.has(node.type));
  const ids = new Set(nodes.map((node) => node.id));

  return {
    edges: graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
    nodes,
  };
}
