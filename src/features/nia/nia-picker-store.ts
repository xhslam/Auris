"use client";

/**
 * Nia 动作选择器的开关与错误状态。
 *
 * 为什么需要一个 store 而不是组件内 state：打开选择器的入口是命令总线
 * （`notes.niaPicker`，由快捷键或命令面板触发），它不在组件树的调用路径上。
 * 跨组件协调正是 store 该承担的那一点点职责。
 *
 * **与 vmark 的关键差异，也是这个文件最初写错的地方。** vmark
 * `geniePickerStore` 是一个五态机（search / freeform / processing / preview /
 * error），还带 `appendResponse` / `setPreview` 用于承接流式回复。第一版把它整体
 * 移了过来——但 auris 的回复流不属于选择器：它活在 `NiaPanel` 内部的
 * `useNiaSession` 里。于是 `processing` / `preview` 两个状态以及
 * `appendResponse` / `setPreview` / `resetToInput` / `setMode` 在 auris **没有
 * 任何东西能驱动**，只有测试在直接调它们。
 *
 * 状态机里的死状态比缺少状态更糟：后来的人会以为它们接好了，在渲染层为
 * `processing` 写分支，然后困惑于为什么永远进不去。所以这里只保留 auris 真的
 * 能驱动的部分。
 *
 * 相应地，选择器提交后**关闭自己**，回复出现在面板既有的响应区（那里已经有
 * apply review 那条落盘审查路径）。而不是留在屏幕上遮住正在流入的回复。
 *
 * `mode` 也随之去掉了：只剩 search / error 两态时，它与 `pickerError !== null`
 * 是同一个事实的两种表示，留着必然发散。
 *
 * `filterScope` 也不在这里。vmark 把它放进 store，但 auris 的选择器还需要
 * 「打开那一刻的内容快照」，而快照只能作为 prop 传（它不是全局状态，是一次调用
 * 的入参）。`hasSelection` 与那份内容天然成对——把 scope 单独塞进 store 会把这
 * 一对拆成两条通道，然后两边各自声称知道「当前该筛什么范围」。所以 store 只保留
 * 命令总线真正需要的那点东西：开关与错误。
 *
 * @module features/nia/nia-picker-store
 */

import { create } from "zustand";

type NiaPickerData = {
  isOpen: boolean;
  pickerError: string | null;
};

type NiaPickerActions = {
  clearPickerError: () => void;
  closePicker: () => void;
  openPicker: () => void;
  setPickerError: (message: string) => void;
};

const initialState: NiaPickerData = {
  isOpen: false,
  pickerError: null,
};

export const useNiaPickerStore = create<NiaPickerData & NiaPickerActions>()((set) => ({
  ...initialState,

  clearPickerError: () => set({ pickerError: null }),

  closePicker: () => set({ ...initialState }),

  openPicker: () =>
    // 整份重置再置 isOpen：上一次的错误不该在下一次打开时还挂着。
    set({ ...initialState, isOpen: true }),

  setPickerError: (message) => set({ pickerError: message }),
}));

/** 仅供测试重置。 */
export function __resetNiaPickerStoreForTests() {
  useNiaPickerStore.setState({ ...initialState });
}
