"use client";

/**
 * Nia 动作选择器：spotlight 式的键盘优先入口。
 *
 * 移植 vmark `GeniePicker.tsx` 的交互契约，落在 auris 既有的 nia 之上。auris
 * 原本已经有定义层（且原生兼容 vmark 的 Genie 格式）、provider 运行时、
 * composer 和 apply review——缺的正是这一层：搜索、scope 过滤、分类、常用、
 * 收藏、方向键导航。没有它，一条已安装的定义在 UI 上没有任何入口。
 *
 * 与 vmark 的差异，都是 auris 现实决定的：
 *
 * - **不内置 quick-action chips**。vmark 的 `GenieChips` 硬编码了四个 genie 名
 *   （polish/condense/fix-grammar/rephrase），在 auris 装不到这些定义时会渲染成
 *   空白一行。favorites 段落做的是同一件事而且由用户决定，所以不移植 chips。
 * - **不在选择器里做 provider 切换**。vmark 的 `ProviderSwitcher` 嵌在选择器
 *   里；auris 的 provider 选择已经在 `nia-provider-settings` 和 composer 里，
 *   再放一份会有两个都声称是「当前 provider」的控件。
 * - **选择器不自己调用 provider**。它把「选中的定义 + 合成好的提示词」交给宿主，
 *   由宿主接到 `useNiaSession().submit()`。这样选择器可以在没有 provider 的环境
 *   里测试，也不会绕开 apply review 那条既有的落盘审查路径。
 *
 * @module components/notes-v2/notes-nia-picker
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildNiaActionListing,
  formatNiaActionName,
  NIA_ACTION_SCOPES,
  pushNiaActionRecent,
  selectInvocableActions,
  toggleNiaActionFavorite,
  type NiaActionPreferences,
  type NiaActionScope,
  type NiaActionSummary,
} from "@/features/nia/nia-action-catalog";
import {
  loadNiaActionPreferences,
  saveNiaActionPreferences,
} from "@/features/nia/nia-action-preferences-store";
import { getNiaBridge } from "@/features/nia/nia-bridge";
import { useNiaPickerStore } from "@/features/nia/nia-picker-store";
import niaPromptComposition from "../../../electron/shared/nia-prompt-composition.cjs";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";

const { composeNiaPrompt } = niaPromptComposition;

export type NiaPickerSubmission = {
  /**
   * 被选中的定义（含 body）。宿主据此决定如何落盘（replace/insert）。
   *
   * 自由输入提交时为 null：那次提交没有定义，也就没有 `action`/`approval` 可依据，
   * 宿主应按「普通提问」处理而不是猜一个落盘模式。
   */
  action: (NiaActionSummary & { body: string }) | null;
  /** 已合成好的提示词，可直接交给 provider。 */
  prompt: string;
};

export type NotesNiaPickerProps = {
  /** 当前可用的内容。为空时只有 document scope 的动作可选。 */
  content: string;
  /** 内容是不是一段选区（决定默认 scope）。 */
  hasSelection: boolean;
  onSubmit: (submission: NiaPickerSubmission) => void;
  /** 注入点，仅供测试。 */
  storage?: Storage | null;
};

export function NotesNiaPicker({
  content,
  hasSelection,
  onSubmit,
  storage,
}: NotesNiaPickerProps) {
  const isOpen = useNiaPickerStore((state) => state.isOpen);
  const closePicker = useNiaPickerStore((state) => state.closePicker);
  const setPickerError = useNiaPickerStore((state) => state.setPickerError);
  // 必须订阅它，不能只写不读：`handleInvoke` 失败时把原因写进 store，如果这里
  // 不渲染，那条错误就没有任何出口——用户点了一下，界面毫无反应。
  const pickerError = useNiaPickerStore((state) => state.pickerError);

  const [definitions, setDefinitions] = useState<readonly NiaActionSummary[]>([]);
  const [preferences, setPreferences] = useState(() =>
    loadNiaActionPreferences(storage ?? null),
  );
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<NiaActionScope | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 只有真的有选区时才默认收窄到 selection。没有选区却默认 selection，会让整个
  // 列表看起来是空的——用户无法从界面看出原因。
  const defaultScope: NiaActionScope | null = hasSelection ? "selection" : null;

  const resolvedStorage = storage ?? (typeof window === "undefined" ? null : window.localStorage);

  const loadDefinitions = useCallback(async () => {
    const bridge = getNiaBridge();

    if (!bridge) {
      // 非桌面环境没有定义存储。如实说明，而不是显示一个空列表让人以为没装动作。
      setLoadError(NOTES_UI_COPY.niaPicker.unavailable);
      setDefinitions([]);
      return;
    }

    setIsLoading(true);
    try {
      const listing = await bridge.listDefinitions();
      setDefinitions(selectInvocableActions(listing.definitions));
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : NOTES_UI_COPY.niaPicker.loadFailed,
      );
      setDefinitions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 每次打开都重新拉取：定义可以在应用外被安装或删除，缓存一份会让选择器显示
  // 已经不存在的动作。vmark 的 picker 也在 open 时 `loadGenies()`。
  useEffect(() => {
    if (!isOpen) return;

    setQuery("");
    setSelectedIndex(0);
    setScope(defaultScope);
    setPreferences(loadNiaActionPreferences(resolvedStorage));
    void loadDefinitions();
  }, [defaultScope, isOpen, loadDefinitions, resolvedStorage]);

  useEffect(() => {
    if (!isOpen) return;
    // rAF 而不是直接 focus：打开的那一帧节点刚插入，直接 focus 在部分浏览器里
    // 会被随后的布局抢走。
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const listing = useMemo(
    () => buildNiaActionListing(definitions, { preferences, query, scope }),
    [definitions, preferences, query, scope],
  );

  // 列表变短后旧的高亮下标可能越界。钳在末尾而不是重置到 0：用户往下走到第 8 项
  // 再多打一个字符，跳回第 1 项比停在最后一项更让人失去位置。
  const orderedCount = listing.ordered.length;
  const activeIndex = orderedCount === 0 ? -1 : Math.min(selectedIndex, orderedCount - 1);
  const activeAction = activeIndex >= 0 ? listing.ordered[activeIndex] : null;

  const handleFavoriteToggle = useCallback(
    (canonicalId: string) => {
      setPreferences((current) => {
        const next: NiaActionPreferences = {
          favorites: toggleNiaActionFavorite(current.favorites, canonicalId),
          recents: current.recents,
        };
        saveNiaActionPreferences(resolvedStorage, next);
        return next;
      });
    },
    [resolvedStorage],
  );

  const handleInvoke = useCallback(
    async (action: NiaActionSummary) => {
      const bridge = getNiaBridge();

      if (!bridge) {
        setPickerError(NOTES_UI_COPY.niaPicker.unavailable);
        return;
      }

      // 列表条目不带 body（IPC 层刻意剥掉，单条 body 上限 200KB）。调用前按需
      // 取完整定义。
      let full: (NiaActionSummary & { body: string }) | null = null;
      try {
        full = (await bridge.getDefinition({
          canonicalId: action.canonicalId,
        })) as (NiaActionSummary & { body: string }) | null;
      } catch (cause) {
        setPickerError(
          cause instanceof Error ? cause.message : NOTES_UI_COPY.niaPicker.loadFailed,
        );
        return;
      }

      if (!full) {
        // 列表可能已经过期（定义在打开选择器之后被卸载）。明说，并刷新列表。
        setPickerError(NOTES_UI_COPY.niaPicker.missing(formatNiaActionName(action.canonicalId)));
        void loadDefinitions();
        return;
      }

      const prompt = composeNiaPrompt({ body: full.body, content });

      const nextPreferences: NiaActionPreferences = {
        favorites: preferences.favorites,
        recents: pushNiaActionRecent(preferences.recents, action.canonicalId),
      };
      setPreferences(nextPreferences);
      saveNiaActionPreferences(resolvedStorage, nextPreferences);

      // 先关闭再提交：回复流进的是面板的响应区（session 在那里），选择器留在
      // 屏幕上只会盖住它，让人以为点击没有生效。
      closePicker();
      onSubmit({ action: full, prompt });
    },
    [
      closePicker,
      content,
      loadDefinitions,
      onSubmit,
      preferences,
      resolvedStorage,
      setPickerError,
    ],
  );

  /**
   * 自由输入提交：把输入框里的文字本身当作提示词。
   *
   * 占位文案承诺了「或直接输入指令」，不实现它就是骗人。合成规则与动作调用共用
   * 同一个 `composeNiaPrompt`——查询是指令、当前内容是素材，所以内容会被追加在
   * 指令之后（查询里没有 `{{content}}`）。
   */
  const handleFreeformSubmit = useCallback(
    (instruction: string) => {
      const trimmed = instruction.trim();
      if (!trimmed) return;

      const prompt = composeNiaPrompt({ body: trimmed, content });
      closePicker();
      onSubmit({ action: null, prompt });
    },
    [closePicker, content, onSubmit],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closePicker();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (orderedCount > 0) setSelectedIndex((current) => (current + 1) % orderedCount);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (orderedCount > 0) {
        setSelectedIndex((current) => (current - 1 + orderedCount) % orderedCount);
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSelectedIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setSelectedIndex(Math.max(0, orderedCount - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (event.nativeEvent.isComposing) return;
      // 有高亮项就调用它；没有匹配项时把输入本身当指令发出去——这正是占位文案
      // 承诺的「或直接输入指令」。
      if (activeAction) void handleInvoke(activeAction);
      else handleFreeformSubmit(query);
    }
  };

  if (!isOpen) {
    return null;
  }

  const renderAction = (action: NiaActionSummary, index: number) => {
    const isActive = index === activeIndex;
    const isFavorite = preferences.favorites.includes(action.canonicalId);

    return (
      <div
        aria-selected={isActive}
        className="notes-v2__nia-picker-item"
        data-active={isActive ? "true" : "false"}
        id={`notes-nia-action-${index}`}
        key={action.canonicalId}
        onClick={() => {
          void handleInvoke(action);
        }}
        onMouseEnter={() => setSelectedIndex(index)}
        role="option"
      >
        <span className="notes-v2__nia-picker-item-name">
          {formatNiaActionName(action.canonicalId)}
        </span>
        <span className="notes-v2__nia-picker-item-meta">
          <span className="notes-v2__nia-picker-item-desc">{action.description}</span>
          <span className="notes-v2__nia-picker-item-scope">{action.scope}</span>
        </span>
        <button
          aria-label={
            isFavorite
              ? NOTES_UI_COPY.niaPicker.unfavorite(formatNiaActionName(action.canonicalId))
              : NOTES_UI_COPY.niaPicker.favorite(formatNiaActionName(action.canonicalId))
          }
          aria-pressed={isFavorite}
          className="notes-v2__nia-picker-favorite"
          onClick={(event) => {
            // 收藏不该同时执行动作。
            event.stopPropagation();
            handleFavoriteToggle(action.canonicalId);
          }}
          type="button"
        >
          <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
        </button>
      </div>
    );
  };

  // 扁平下标必须与 `listing.ordered` 一致，否则方向键的高亮会和视觉顺序错位。
  let flatIndex = 0;
  const nextIndex = () => flatIndex++;

  return (
    <div className="notes-v2__nia-picker-backdrop" role="presentation">
      <div
        aria-label={NOTES_UI_COPY.niaPicker.dialogLabel}
        className="notes-v2__nia-picker"
        onKeyDown={onKeyDown}
        role="dialog"
      >
        <div className="notes-v2__nia-picker-header">
          <input
            aria-activedescendant={
              activeIndex >= 0 ? `notes-nia-action-${activeIndex}` : undefined
            }
            aria-controls="notes-nia-action-list"
            aria-label={NOTES_UI_COPY.niaPicker.searchLabel}
            className="notes-v2__nia-picker-input"
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder={NOTES_UI_COPY.niaPicker.placeholder}
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            type="text"
            value={query}
          />

          <div className="notes-v2__nia-picker-scopes" role="group">
            <button
              aria-pressed={scope === null}
              className="notes-v2__nia-picker-scope"
              data-active={scope === null ? "true" : "false"}
              onClick={() => {
                setScope(null);
                setSelectedIndex(0);
              }}
              type="button"
            >
              {NOTES_UI_COPY.niaPicker.scopeAll}
            </button>
            {NIA_ACTION_SCOPES.map((candidate) => (
              <button
                aria-pressed={scope === candidate}
                className="notes-v2__nia-picker-scope"
                data-active={scope === candidate ? "true" : "false"}
                key={candidate}
                onClick={() => {
                  setScope(candidate);
                  setSelectedIndex(0);
                }}
                type="button"
              >
                {NOTES_UI_COPY.niaPicker.scopeLabels[candidate]}
              </button>
            ))}
          </div>
        </div>

        <div
          className="notes-v2__nia-picker-list"
          id="notes-nia-action-list"
          ref={listRef}
          role="listbox"
        >
          {/* 调用失败先报：它是用户刚刚那次操作的结果，比列表状态更紧要。 */}
          {pickerError ? (
            <p className="notes-v2__nia-picker-empty" role="alert">
              {pickerError}
            </p>
          ) : null}

          {loadError ? (
            <p className="notes-v2__nia-picker-empty" role="alert">
              {loadError}
            </p>
          ) : null}

          {!loadError && isLoading && definitions.length === 0 ? (
            <p className="notes-v2__nia-picker-empty">{NOTES_UI_COPY.niaPicker.loading}</p>
          ) : null}

          {!loadError && !isLoading && orderedCount === 0 ? (
            <p className="notes-v2__nia-picker-empty">
              {definitions.length === 0
                ? NOTES_UI_COPY.niaPicker.emptyCatalog
                : NOTES_UI_COPY.niaPicker.emptyMatch}
            </p>
          ) : null}

          {listing.isSearching
            ? listing.results.map((action) => renderAction(action, nextIndex()))
            : (
              <>
                {listing.favorites.length > 0 ? (
                  <div className="notes-v2__nia-picker-group">
                    <p className="notes-v2__nia-picker-group-title">
                      {NOTES_UI_COPY.niaPicker.favorites}
                    </p>
                    {listing.favorites.map((action) => renderAction(action, nextIndex()))}
                  </div>
                ) : null}

                {listing.recents.length > 0 ? (
                  <div className="notes-v2__nia-picker-group">
                    <p className="notes-v2__nia-picker-group-title">
                      {NOTES_UI_COPY.niaPicker.recents}
                    </p>
                    {listing.recents.map((action) => renderAction(action, nextIndex()))}
                  </div>
                ) : null}

                {listing.grouped.map((group) => (
                  <div
                    className="notes-v2__nia-picker-group"
                    key={group.category ?? "\0uncategorized"}
                  >
                    <p className="notes-v2__nia-picker-group-title">
                      {group.category ?? NOTES_UI_COPY.niaPicker.uncategorized}
                    </p>
                    {group.actions.map((action) => renderAction(action, nextIndex()))}
                  </div>
                ))}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
