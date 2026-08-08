/**
 * 测试用的完整 desktop bridge 工厂。
 *
 * 存在的理由是一个真实的坑：`isDesktopBridge()` 要求 commands / downloads /
 * plugins / runtimeState / system / vault / window 全部到位，缺一个就整体判为
 * `null`。所以只挂 `{ updates }` 或 `{ vault }` 的局部假桥，在被测组件里表现为
 * 「桌面环境不可用」——测试会以为自己在测降级路径，其实是桥根本没装上。
 *
 * 每个用例各写一份完整桥会重复 60 行且容易漏掉新增的必填子桥，所以集中在这里。
 *
 * @module tests/helpers/desktop-bridge
 */

import { vi } from "vitest";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

const EMPTY_VAULT_INFO = {
  directoryName: null,
  hasVault: false,
  pluginDirectory: null,
  vaultPath: null,
};

/**
 * 构造一份能通过 `isDesktopBridge()` 的最小完整桥。
 *
 * `overrides` 按子桥浅合并：传 `{ vault: { listRoots } }` 会在保留其余 vault
 * 必填方法的同时加上 `listRoots`，不必重列整个 vault。
 */
export function createTestDesktopBridge(
  overrides: Partial<Record<keyof DesktopBridge, unknown>> = {},
): DesktopBridge {
  const base: Record<string, unknown> = {
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: false })),
    },
    downloads: {
      exportJson: vi.fn(async () => ({ path: "/tmp/export.json" })),
      getDirectoryInfo: vi.fn(async () => ({ directoryPath: "/tmp" })),
      revealDirectory: vi.fn(async () => undefined),
    },
    plugins: {
      list: vi.fn(async () => []),
      openDirectory: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => []),
    },
    runtimeState: {
      get: vi.fn(async () => ({})),
      importLegacy: vi.fn(async () => ({})),
      setLastWorkspace: vi.fn(async () => ({})),
    },
    system: {
      openUpgrade: vi.fn(async () => ({ didOpen: false, targetUrl: null })),
    },
    vault: {
      getDirectoryInfo: vi.fn(async () => EMPTY_VAULT_INFO),
      listFiles: vi.fn(async () => []),
      onDidChange: vi.fn(() => () => undefined),
      pickDirectory: vi.fn(async () => EMPTY_VAULT_INFO),
      readFile: vi.fn(async () => null),
      removeFile: vi.fn(async () => undefined),
      revealPluginsDirectory: vi.fn(async () => undefined),
      saveFile: vi.fn(async () => undefined),
    },
    window: { showInFolder: vi.fn(async () => undefined) },
  };

  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    const existing = merged[key];
    merged[key] =
      existing && typeof existing === "object" && value && typeof value === "object"
        ? { ...(existing as object), ...(value as object) }
        : value;
  }

  return merged as unknown as DesktopBridge;
}
