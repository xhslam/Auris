/**
 * Nia 选择器 store 的状态测试。
 *
 * 这个 store 刻意很小，所以这里断言的重点不是「setter 会赋值」，而是两条真的
 * 会出错的语义：
 *
 * 1. **打开时必须整份重置**。上一次调用留下的错误若跨越一次打开，用户会看到一条
 *    与当前操作无关的报错，且无法判断它是什么时候产生的。
 * 2. **关闭时必须清干净**。否则下次打开会闪现上一次的错误。
 *
 * 这个文件的第一版还测了 `appendResponse` / `setPreview` / `resetToInput` /
 * `setMode` 与五个 mode——那些是从 vmark `geniePickerStore` 整体移植过来的，而
 * auris 的回复流属于 `NiaPanel` 内部的 `useNiaSession`，选择器根本拿不到它。
 * 那些测试只证明了 setter 会赋值，应用里没有任何路径能到达它们。移除它们和对应
 * 的 store 成员，是因为「测试覆盖了一个无人能驱动的状态」比没有覆盖更糟：它让
 * 死代码看起来是活的。
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetNiaPickerStoreForTests,
  useNiaPickerStore,
} from "@/features/nia/nia-picker-store";

const store = () => useNiaPickerStore.getState();

describe("Nia picker store", () => {
  beforeEach(() => {
    __resetNiaPickerStoreForTests();
  });

  it("starts closed with no error", () => {
    expect(store().isOpen).toBe(false);
    expect(store().pickerError).toBeNull();
  });

  it("opens and closes", () => {
    store().openPicker();
    expect(store().isOpen).toBe(true);

    store().closePicker();
    expect(store().isOpen).toBe(false);
  });

  it("clears a stale error when reopened", () => {
    store().openPicker();
    store().setPickerError("Definition was uninstalled.");
    store().closePicker();

    store().openPicker();

    // 上一次的报错跨越一次打开，会让用户看到一条与当前操作无关的错误。
    expect(store().pickerError).toBeNull();
    expect(store().isOpen).toBe(true);
  });

  it("clears the error on close so the next open does not flash it", () => {
    store().openPicker();
    store().setPickerError("Nia bridge unavailable.");

    store().closePicker();

    expect(store().pickerError).toBeNull();
  });

  it("clears an error without closing, so a retry stays in place", () => {
    store().openPicker();
    store().setPickerError("Definition was uninstalled.");

    store().clearPickerError();

    // 清错误不该顺带关掉选择器：用户刚看到失败原因，接下来要在同一个列表里改选。
    expect(store().pickerError).toBeNull();
    expect(store().isOpen).toBe(true);
  });

  it("keeps the latest error when two failures arrive in a row", () => {
    store().openPicker();
    store().setPickerError("first");
    store().setPickerError("second");

    expect(store().pickerError).toBe("second");
  });
});
