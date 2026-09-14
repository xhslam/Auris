import {
  DEFAULT_UPDATE_SETTINGS,
  UPDATE_SETTINGS_EVENT,
  isUpdateCheckFrequency,
  loadUpdateSettings,
  saveUpdateSettings,
  shouldCheckNow,
  updateUpdateSetting,
  type UpdateSettings,
} from "@/features/updates/update-settings";

const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;
const NOW = 1_800_000_000_000;

describe("update-settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("shouldCheckNow — 逐条对齐 vmark useUpdateChecker.shouldCheckNow", () => {
    it("关闭自动检查时永不检查，即使频率是 startup", () => {
      expect(shouldCheckNow(false, "startup", null, NOW)).toBe(false);
      expect(shouldCheckNow(false, "daily", null, NOW)).toBe(false);
    });

    it("manual 频率永不自动检查", () => {
      expect(shouldCheckNow(true, "manual", null, NOW)).toBe(false);
      expect(shouldCheckNow(true, "manual", NOW - ONE_WEEK * 10, NOW)).toBe(false);
    });

    it("startup 频率每次都检查，忽略上次时间", () => {
      expect(shouldCheckNow(true, "startup", null, NOW)).toBe(true);
      expect(shouldCheckNow(true, "startup", NOW - 1, NOW)).toBe(true);
    });

    it("从未检查过时，daily/weekly 都检查", () => {
      expect(shouldCheckNow(true, "daily", null, NOW)).toBe(true);
      expect(shouldCheckNow(true, "weekly", null, NOW)).toBe(true);
    });

    it("daily 以 24h 为界，边界值算到期", () => {
      expect(shouldCheckNow(true, "daily", NOW - ONE_DAY + 1, NOW)).toBe(false);
      expect(shouldCheckNow(true, "daily", NOW - ONE_DAY, NOW)).toBe(true);
    });

    it("weekly 以 7 天为界，边界值算到期", () => {
      expect(shouldCheckNow(true, "weekly", NOW - ONE_WEEK + 1, NOW)).toBe(false);
      expect(shouldCheckNow(true, "weekly", NOW - ONE_WEEK, NOW)).toBe(true);
    });

    it("lastCheckTimestamp 为 0 视为从未检查（对齐 vmark 的 falsy 判定）", () => {
      expect(shouldCheckNow(true, "daily", 0, NOW)).toBe(true);
    });
  });

  describe("isUpdateCheckFrequency", () => {
    it("只接受四个已知频率", () => {
      for (const value of ["startup", "daily", "weekly", "manual"]) {
        expect(isUpdateCheckFrequency(value)).toBe(true);
      }
    });

    it("拒绝未知值与非字符串", () => {
      expect(isUpdateCheckFrequency("hourly")).toBe(false);
      expect(isUpdateCheckFrequency("")).toBe(false);
      expect(isUpdateCheckFrequency(null)).toBe(false);
      expect(isUpdateCheckFrequency(7)).toBe(false);
    });
  });

  describe("持久化与 sanitize", () => {
    it("没有存过时返回默认值", () => {
      expect(loadUpdateSettings()).toEqual(DEFAULT_UPDATE_SETTINGS);
    });

    it("默认值与 vmark defaults.ts 一致", () => {
      expect(DEFAULT_UPDATE_SETTINGS).toEqual({
        autoCheckEnabled: true,
        autoDownload: false,
        checkFrequency: "startup",
        lastCheckTimestamp: null,
        skipVersion: null,
      });
    });

    it("save 后 load 得到同一份设置", () => {
      const next: UpdateSettings = {
        autoCheckEnabled: false,
        autoDownload: true,
        checkFrequency: "weekly",
        lastCheckTimestamp: NOW,
        skipVersion: "9.9.9",
      };
      saveUpdateSettings(next);
      expect(loadUpdateSettings()).toEqual(next);
    });

    it("损坏的 JSON 回退默认值，不抛错", () => {
      window.localStorage.setItem("auris.updates.settings", "{not json");
      expect(loadUpdateSettings()).toEqual(DEFAULT_UPDATE_SETTINGS);
    });

    it("未知频率被 sanitize 回默认，不污染状态机", () => {
      window.localStorage.setItem(
        "auris.updates.settings",
        JSON.stringify({ checkFrequency: "hourly" }),
      );
      expect(loadUpdateSettings().checkFrequency).toBe("startup");
    });

    it("非有限数的时间戳归一成 null，避免 NaN 比较让检查永不触发", () => {
      window.localStorage.setItem(
        "auris.updates.settings",
        JSON.stringify({ lastCheckTimestamp: Number.NaN }),
      );
      expect(loadUpdateSettings().lastCheckTimestamp).toBeNull();

      window.localStorage.setItem(
        "auris.updates.settings",
        JSON.stringify({ lastCheckTimestamp: "yesterday" }),
      );
      expect(loadUpdateSettings().lastCheckTimestamp).toBeNull();
    });

    it("空字符串 skipVersion 归一成 null，不会跳过一个不存在的版本", () => {
      window.localStorage.setItem(
        "auris.updates.settings",
        JSON.stringify({ skipVersion: "" }),
      );
      expect(loadUpdateSettings().skipVersion).toBeNull();
    });

    it("save 会广播变更事件，让已挂载界面即时跟随", () => {
      const listener = vi.fn();
      window.addEventListener(UPDATE_SETTINGS_EVENT, listener);
      saveUpdateSettings({ ...DEFAULT_UPDATE_SETTINGS, autoDownload: true });
      window.removeEventListener(UPDATE_SETTINGS_EVENT, listener);

      expect(listener).toHaveBeenCalledTimes(1);
      const detail = (listener.mock.calls[0][0] as CustomEvent<UpdateSettings>).detail;
      expect(detail.autoDownload).toBe(true);
    });

    it("updateUpdateSetting 只改一个字段，其余保留", () => {
      saveUpdateSettings({
        ...DEFAULT_UPDATE_SETTINGS,
        checkFrequency: "weekly",
        skipVersion: "1.2.3",
      });

      const next = updateUpdateSetting("autoDownload", true);

      expect(next.autoDownload).toBe(true);
      expect(next.checkFrequency).toBe("weekly");
      expect(next.skipVersion).toBe("1.2.3");
      expect(loadUpdateSettings()).toEqual(next);
    });
  });
});
