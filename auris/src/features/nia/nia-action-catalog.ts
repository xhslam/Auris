/**
 * Nia 动作目录：搜索、scope 过滤、分组、recents / favorites。
 *
 * 移植 vmark `stores/aiStore/genies.ts` 里与选择器相关的纯逻辑
 * （`searchGenies` / `getGroupedByCategory` / `getRecent` / MRU 合并），以及
 * `GeniePicker.tsx` 里那段 `filtered` + `recents` 的推导。
 *
 * 与 vmark 的差异，以及为什么：
 *
 * 1. **不做跨窗口 MRU 合并**。vmark 的 `mergeMruList` + `createFieldChangeGated‑
 *    Storage` 解决的是「多个窗口共享一个 localStorage key，各自持有 store 实例，
 *    未经合并的写会覆盖另一个窗口刚写入的偏好」。auris 主进程是 `mainWindow`
 *    单例，没有第二个窗口能产生这种竞争。照搬合并逻辑会引入一套无人触发的
 *    代码路径，还要维护它的「取消收藏可能被另一个窗口的合并复活」这类怪异语义。
 *
 * 2. **scope 取值不同**。vmark 是 `selection | block | document`；auris 的定义
 *    契约（`NIA_DEFINITION_SCOPES`）是 `selection | document | workflow-step`。
 *    不硬造一个 auris 契约里不存在的 `block`。`workflow-step` 的定义**不进
 *    选择器**——它是工作流步骤的被调用方，不是用户能直接对着选区调用的动作，
 *    列出来只会让人点了之后困惑。
 *
 * 纯函数：不碰 store、不碰 IPC、不碰 localStorage，所以搜索与排序规则可直接单测。
 *
 * @module features/nia/nia-action-catalog
 */

import type { NiaDefinitionSummary } from "@/features/nia/nia-bridge";

/** 能出现在选择器里的 scope。`workflow-step` 被刻意排除，见模块头。 */
export type NiaActionScope = "selection" | "document";

export const NIA_ACTION_SCOPES: readonly NiaActionScope[] = Object.freeze([
  "selection",
  "document",
]);

/** recents 上限，对齐 vmark 的 `MAX_RECENTS`。 */
export const MAX_NIA_ACTION_RECENTS = 10;

/**
 * 选择器条目：就是 IPC `listDefinitions` 返回的那份摘要，只把 `scope` 收窄。
 *
 * 从 IPC 摘要类型派生而不是从 `NiaDefinitionRecord` 派生，是因为后者带 `body`。
 * 早先的写法是 `Omit<NiaDefinitionRecord, "body"> & { body?: never }`，那个
 * `body?: never` 会污染任何交叉类型——`NiaActionSummary & { body: string }`
 * 里的 `body` 会塌成 `never`，于是「取完整定义后读它的 body」在类型上不可表达。
 * 摘要就该是摘要的形状，不是「完整记录去掉一个字段再禁止它回来」。
 */
export type NiaActionSummary = Omit<NiaDefinitionSummary, "scope"> & {
  readonly scope: NiaActionScope;
};

/** 完整定义：摘要 + `getDefinition` 才会返回的正文。 */
export type NiaActionDefinition = NiaActionSummary & {
  readonly body: string;
};

export type NiaActionPreferences = {
  readonly favorites: readonly string[];
  readonly recents: readonly string[];
};

export const EMPTY_NIA_ACTION_PREFERENCES: NiaActionPreferences = Object.freeze({
  favorites: Object.freeze([]),
  recents: Object.freeze([]),
});

/**
 * 只保留能被用户直接调用的定义。
 *
 * `workflow-step` 作用域的定义是工作流内部的被调用方，没有「当前选区」可以套用，
 * 出现在选择器里点下去必然无事发生。
 */
export function selectInvocableActions<Entry extends { scope: string }>(
  definitions: readonly Entry[],
): Array<Entry & { scope: NiaActionScope }> {
  // 泛型 + 类型守卫：调用方传进来的是 IPC 的宽 `scope: string`，这次过滤既是
  // 业务筛选也是这条边界上唯一的收窄点，所以让它同时承担类型收窄，而不是要求
  // 调用方在外面再断言一次。
  return definitions.filter(
    (definition): definition is Entry & { scope: NiaActionScope } =>
      definition.scope === "selection" || definition.scope === "document",
  );
}

/** kebab-case → Title Case。移植 vmark `GenieItem.tsx#formatName`。 */
export function formatNiaActionName(canonicalId: string): string {
  return canonicalId.replace(/-/gu, " ").replace(/\b\w/gu, (char) => char.toUpperCase());
}

/**
 * 搜索 + scope 过滤。
 *
 * 匹配 canonicalId、description、category 与 tags。vmark 只匹配前三项；tags
 * 是 auris 定义契约里的一等字段（`NIA_DEFINITION_LIMITS.maxTags`），既然定义
 * 作者可以写 tags，搜索就该看它，否则那个字段对用户不可见也就没有意义。
 */
export function searchNiaActions(
  definitions: readonly NiaActionSummary[],
  query: string,
  scope: NiaActionScope | null = null,
): NiaActionSummary[] {
  const needle = query.trim().toLowerCase();

  return selectInvocableActions(definitions).filter((definition) => {
    if (scope && definition.scope !== scope) return false;
    if (!needle) return true;

    if (definition.canonicalId.toLowerCase().includes(needle)) return true;
    if (definition.description.toLowerCase().includes(needle)) return true;
    if (definition.category?.toLowerCase().includes(needle)) return true;
    return (definition.tags ?? []).some((tag) => tag.toLowerCase().includes(needle));
  });
}

/**
 * 按分类分组，分类名排序稳定；无分类的归到 `null` 键。
 *
 * 用 `null` 而不是字面量 `"Uncategorized"`（vmark 的做法）：分类的缺失是「没有
 * 分类」，不是「有一个叫 Uncategorized 的分类」。用字面量会让一个真的把定义
 * 归到 `category: uncategorized` 的作者和未分类定义混在一起，并且强迫这一层
 * 决定该显示什么文案——那是渲染层的事。
 */
export function groupNiaActionsByCategory(
  definitions: readonly NiaActionSummary[],
): Array<{ category: string | null; actions: NiaActionSummary[] }> {
  const grouped = new Map<string | null, NiaActionSummary[]>();

  for (const definition of definitions) {
    const key = definition.category ?? null;
    const bucket = grouped.get(key) ?? [];
    bucket.push(definition);
    grouped.set(key, bucket);
  }

  const named = [...grouped.entries()]
    .filter((entry): entry is [string, NiaActionSummary[]] => entry[0] !== null)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([category, actions]) => ({ actions, category }));

  const uncategorized = grouped.get(null);

  // 未分类始终排在最后：它不是一个名字，参与字母序会让它的位置取决于其他分类
  // 的名字，看起来像随机跳动。
  return uncategorized ? [...named, { actions: uncategorized, category: null }] : named;
}

/** 把一个名字推到 MRU 头部并截断。 */
export function pushNiaActionRecent(
  recents: readonly string[],
  canonicalId: string,
  limit = MAX_NIA_ACTION_RECENTS,
): string[] {
  return [canonicalId, ...recents.filter((entry) => entry !== canonicalId)].slice(0, limit);
}

export function toggleNiaActionFavorite(
  favorites: readonly string[],
  canonicalId: string,
): string[] {
  return favorites.includes(canonicalId)
    ? favorites.filter((entry) => entry !== canonicalId)
    : [...favorites, canonicalId];
}

/**
 * 按 recents 顺序解析出定义，丢掉已经不存在的名字。
 *
 * 不在这里改写偏好本身：解析发生在渲染路径上，让读取顺带产生一次持久化写入
 * 会让「打开选择器」变成一个有副作用的动作。清理由
 * `pruneNiaActionPreferences` 在定义列表刷新时显式做。
 */
export function resolveNiaActionRecents(
  definitions: readonly NiaActionSummary[],
  recents: readonly string[],
  scope: NiaActionScope | null = null,
): NiaActionSummary[] {
  const invocable = selectInvocableActions(definitions);

  return recents
    .map((canonicalId) =>
      invocable.find((definition) => definition.canonicalId === canonicalId),
    )
    .filter((definition): definition is NiaActionSummary => definition !== undefined)
    .filter((definition) => !scope || definition.scope === scope);
}

export function resolveNiaActionFavorites(
  definitions: readonly NiaActionSummary[],
  favorites: readonly string[],
  scope: NiaActionScope | null = null,
): NiaActionSummary[] {
  return selectInvocableActions(definitions)
    .filter((definition) => favorites.includes(definition.canonicalId))
    .filter((definition) => !scope || definition.scope === scope)
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
}

/**
 * 用最新的定义列表清理偏好里的失效名字。
 *
 * 对齐 vmark 在 `loadGenies` 末尾做的 prune：定义文件被删掉后，它的名字不该
 * 继续占着 recents 的一个槽位。
 */
export function pruneNiaActionPreferences(
  definitions: readonly NiaActionSummary[],
  preferences: NiaActionPreferences,
): NiaActionPreferences {
  const known = new Set(
    selectInvocableActions(definitions).map((definition) => definition.canonicalId),
  );

  return {
    favorites: preferences.favorites.filter((entry) => known.has(entry)),
    recents: preferences.recents
      .filter((entry) => known.has(entry))
      .slice(0, MAX_NIA_ACTION_RECENTS),
  };
}

/**
 * 选择器列表的最终顺序：favorites → recents → 其余（按分类分组）。
 *
 * 有查询时不分段，直接给搜索结果——搜索的心智模型是「找那一个」，分段会让
 * 同一个结果在 favorites 和 results 里出现两次。vmark 的 `recents` 也是
 * `filter ? [] : …`，同一个判断。
 */
export function buildNiaActionListing(
  definitions: readonly NiaActionSummary[],
  options: {
    preferences: NiaActionPreferences;
    query: string;
    scope: NiaActionScope | null;
  },
): {
  favorites: NiaActionSummary[];
  grouped: Array<{ category: string | null; actions: NiaActionSummary[] }>;
  isSearching: boolean;
  /** 扁平化的可选中顺序，键盘导航按它走。 */
  ordered: NiaActionSummary[];
  recents: NiaActionSummary[];
  results: NiaActionSummary[];
} {
  const matched = searchNiaActions(definitions, options.query, options.scope);
  const isSearching = options.query.trim().length > 0;

  if (isSearching) {
    return {
      favorites: [],
      grouped: [],
      isSearching: true,
      ordered: matched,
      recents: [],
      results: matched,
    };
  }

  const favorites = resolveNiaActionFavorites(
    definitions,
    options.preferences.favorites,
    options.scope,
  );
  const recents = resolveNiaActionRecents(
    definitions,
    options.preferences.recents,
    options.scope,
  ).filter(
    (definition) =>
      !favorites.some((favorite) => favorite.canonicalId === definition.canonicalId),
  );

  const promoted = new Set([
    ...favorites.map((definition) => definition.canonicalId),
    ...recents.map((definition) => definition.canonicalId),
  ]);
  const rest = matched.filter((definition) => !promoted.has(definition.canonicalId));
  const grouped = groupNiaActionsByCategory(rest);

  return {
    favorites,
    grouped,
    isSearching: false,
    ordered: [...favorites, ...recents, ...grouped.flatMap((group) => group.actions)],
    recents,
    results: matched,
  };
}
