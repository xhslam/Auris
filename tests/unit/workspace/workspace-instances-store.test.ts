/**
 * 工作区实例 store。
 *
 * 对齐 vmark `workspaceInstancesStore.test.ts` 的关注点，但去掉 windowLabel
 * 维度（auris 单窗口）。重点覆盖 vmark 注释里点名的那几条不变量：
 * placeholder 被真实实例顶掉、reorder 去重、激活项在移除后有合法回退、
 * per-instance 状态 stash/restore 不互相污染。
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetWorkspaceInstancesForTests,
  selectOrderedInstances,
  uniqueWorkspaceIds,
  useWorkspaceInstancesStore,
  type WorkspaceInstanceRecord,
} from "@/features/notes/workspace/workspace-instances-store";
import {
  createWorkspaceInstance,
  createWorkspaceRootIdentity,
} from "@/features/notes/workspace/workspace-identity";

function workspaceInstance(id: string, rootPath: string): WorkspaceInstanceRecord {
  const result = createWorkspaceRootIdentity(rootPath, { platform: "macos" });
  if (!result.ok) throw new Error("fixture root must be valid");

  return createWorkspaceInstance({
    createdFrom: "open",
    root: result.root,
    workspaceInstanceId: id,
  });
}

const store = () => useWorkspaceInstancesStore.getState();

describe("workspace instances store", () => {
  beforeEach(() => {
    __resetWorkspaceInstancesForTests();
  });

  describe("uniqueWorkspaceIds", () => {
    it("keeps first occurrence order and drops repeats", () => {
      expect(uniqueWorkspaceIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
    });
  });

  describe("addWorkspaceInstance", () => {
    it("adds an instance and activates it when nothing was active", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));

      expect(store().workspaceInstanceIds).toEqual(["w1"]);
      expect(store().activeWorkspaceInstanceId).toBe("w1");
    });

    it("keeps the existing activation when adding a second instance", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));
      store().addWorkspaceInstance(workspaceInstance("w2", "/vaults/beta"));

      expect(store().workspaceInstanceIds).toEqual(["w1", "w2"]);
      // 新增不该抢走用户正在看的工作区。
      expect(store().activeWorkspaceInstanceId).toBe("w1");
    });

    it("does not duplicate an id that is already listed", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));

      expect(store().workspaceInstanceIds).toEqual(["w1"]);
    });

    it("evicts the placeholder once a real workspace arrives", () => {
      store().ensurePlaceholderInstance("ph1");
      expect(store().workspaceInstanceIds).toEqual(["ph1"]);

      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));

      // placeholder 是"还没有任何工作区"的占位，真实实例到了就该消失，
      // 否则 rail 上会永久留下一个点不开的空条目。
      expect(store().workspaceInstanceIds).toEqual(["w1"]);
      expect(store().instances.ph1).toBeUndefined();
      expect(store().activeWorkspaceInstanceId).toBe("w1");
    });
  });

  describe("ensurePlaceholderInstance", () => {
    it("does nothing when an instance already exists", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));
      store().ensurePlaceholderInstance("ph1");

      expect(store().workspaceInstanceIds).toEqual(["w1"]);
    });
  });

  describe("ensureLooseInstance", () => {
    it("creates one loose instance and reuses it", () => {
      const first = store().ensureLooseInstance();
      const second = store().ensureLooseInstance();

      expect(first.workspaceInstanceId).toBe(second.workspaceInstanceId);
      expect(store().workspaceInstanceIds).toHaveLength(1);
      expect(first.kind).toBe("loose");
    });

    it("does not steal activation from a real workspace", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));
      store().ensureLooseInstance();

      // vmark WI-13.1：ensureLoose 是结构性操作，不该把用户看到的上下文抢走。
      expect(store().activeWorkspaceInstanceId).toBe("w1");
    });
  });

  describe("activateWorkspaceInstance", () => {
    it("ignores an id that is not listed", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));
      store().activateWorkspaceInstance("ghost");

      expect(store().activeWorkspaceInstanceId).toBe("w1");
    });
  });

  describe("reorderWorkspaceInstances", () => {
    beforeEach(() => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));
      store().addWorkspaceInstance(workspaceInstance("w2", "/vaults/beta"));
      store().addWorkspaceInstance(workspaceInstance("w3", "/vaults/gamma"));
    });

    it("applies a full reorder", () => {
      store().reorderWorkspaceInstances(["w3", "w1", "w2"]);
      expect(store().workspaceInstanceIds).toEqual(["w3", "w1", "w2"]);
    });

    it("appends omitted ids instead of dropping them", () => {
      store().reorderWorkspaceInstances(["w3"]);
      expect(store().workspaceInstanceIds).toEqual(["w3", "w1", "w2"]);
    });

    it("de-duplicates a repeated id so an instance is never listed twice", () => {
      store().reorderWorkspaceInstances(["w2", "w2", "w1"]);
      expect(store().workspaceInstanceIds).toEqual(["w2", "w1", "w3"]);
    });

    it("ignores unknown ids", () => {
      store().reorderWorkspaceInstances(["ghost", "w2"]);
      expect(store().workspaceInstanceIds).toEqual(["w2", "w1", "w3"]);
    });
  });

  describe("removeWorkspaceInstance", () => {
    it("falls back to a remaining instance when the active one is removed", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));
      store().addWorkspaceInstance(workspaceInstance("w2", "/vaults/beta"));
      store().activateWorkspaceInstance("w2");

      store().removeWorkspaceInstance("w2");

      expect(store().workspaceInstanceIds).toEqual(["w1"]);
      expect(store().activeWorkspaceInstanceId).toBe("w1");
    });

    it("leaves no activation when the last instance is removed", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));
      store().removeWorkspaceInstance("w1");

      expect(store().workspaceInstanceIds).toEqual([]);
      expect(store().activeWorkspaceInstanceId).toBeNull();
    });

  });

  /**
   * 这个 store 刻意**不**持有工作区状态（activePath / openTabs / …）。
   *
   * auris 已经按 vaultRoot 分键持久化整份 `NotesWorkspaceState`（hot-exit +
   * localStorage），且 `useWorkspacePersistence(vaultRoot)` 在 root 变化时自动
   * 重新 hydrate。如果这里再存一份，切换工作区时就有两个都声称持有「root X 的
   * 状态」的来源，必然发散：谁后写谁赢，用户看到的是随机丢 tab。
   *
   * vmark 必须自己 stash，是因为它的工作区状态散在窗口作用域的 tab/pane store
   * 里、没有按 root 的持久化。auris 有，所以照搬那一层是把一个它不需要的问题
   * 连同解法一起搬进来。
   */
  describe("state ownership", () => {
    it("holds no workspace state, leaving per-root persistence as the single source", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));

      const snapshot = store();
      expect(snapshot).not.toHaveProperty("stashedStates");
      expect(snapshot.instances.w1).not.toHaveProperty("openPaths");
      expect(snapshot.instances.w1).not.toHaveProperty("activePath");
      // 记录里只有身份，没有内容。
      expect(Object.keys(snapshot.instances.w1).sort()).toEqual([
        "createdFrom",
        "displayName",
        "kind",
        "rootId",
        "rootPath",
        "workspaceInstanceId",
      ]);
    });
  });

  describe("setInstanceUnavailableRoot", () => {
    it("marks and clears an unreachable root", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));

      store().setInstanceUnavailableRoot("w1", true);
      expect(store().instances.w1.unavailableRoot).toBe(true);

      store().setInstanceUnavailableRoot("w1", false);
      expect(store().instances.w1.unavailableRoot).toBe(false);
    });
  });

  describe("selectOrderedInstances", () => {
    it("returns instances in rail order and skips missing records", () => {
      store().addWorkspaceInstance(workspaceInstance("w1", "/vaults/alpha"));
      store().addWorkspaceInstance(workspaceInstance("w2", "/vaults/beta"));
      store().reorderWorkspaceInstances(["w2", "w1"]);

      expect(
        selectOrderedInstances(useWorkspaceInstancesStore.getState()).map(
          (instance) => instance.workspaceInstanceId,
        ),
      ).toEqual(["w2", "w1"]);
    });
  });
});
