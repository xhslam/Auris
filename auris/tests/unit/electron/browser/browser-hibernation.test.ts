import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserHibernation } = require(
  "../../../../electron/browser/browser-hibernation.cjs",
);

describe("browser hibernation", () => {
  it("serializes only safe URL/title/mode metadata", () => {
    const hibernation = createBrowserHibernation();
    expect(hibernation.serialize({
      automationMode: "AiSandbox",
      controlEpoch: 9,
      historyEntries: ["https://secret.example/a", "https://secret.example/b"],
      leaseToken: "must-not-serialize",
      title: "Research",
      url: "https://example.com/page",
    })).toEqual({
      automationMode: "AiSandbox",
      title: "Research",
      url: "https://example.com/page",
    });
  });

  it("excludes active, controlled, pending-approval, and non-ready tabs", () => {
    const hibernation = createBrowserHibernation();
    expect(hibernation.canHibernate({
      active: false,
      controlled: false,
      lifecycle: "ready",
      loading: false,
      pendingApproval: false,
    })).toBe(true);
    expect(hibernation.canHibernate({
      active: true,
      controlled: false,
      lifecycle: "ready",
      loading: false,
      pendingApproval: false,
    })).toBe(false);
    expect(hibernation.canHibernate({
      active: false,
      controlled: true,
      lifecycle: "ready",
      loading: false,
      pendingApproval: false,
    })).toBe(false);
    expect(hibernation.canHibernate({
      active: false,
      controlled: false,
      lifecycle: "ready",
      loading: false,
      pendingApproval: true,
    })).toBe(false);
    expect(hibernation.canHibernate({
      active: false,
      controlled: false,
      lifecycle: "crashed",
      loading: false,
      pendingApproval: false,
    })).toBe(false);
  });

  it("picks oldest eligible victims under overflow and all eligible under memory pressure", () => {
    const hibernation = createBrowserHibernation({ maxLiveViews: 2 });
    const tabs = [
      {
        active: true,
        lastActiveAt: 30,
        lifecycle: "ready",
        loading: false,
        tabId: "active",
        windowId: "w1",
      },
      {
        active: false,
        lastActiveAt: 10,
        lifecycle: "ready",
        loading: false,
        tabId: "old",
        windowId: "w1",
      },
      {
        active: false,
        lastActiveAt: 20,
        lifecycle: "ready",
        loading: false,
        tabId: "mid",
        windowId: "w1",
      },
      {
        active: false,
        controlled: true,
        lastActiveAt: 5,
        lifecycle: "ready",
        loading: false,
        tabId: "leased",
        windowId: "w1",
      },
    ];
    expect(hibernation.pickVictims({ tabs })).toEqual([
      { tabId: "old", windowId: "w1" },
      { tabId: "mid", windowId: "w1" },
    ]);
    expect(hibernation.pickVictims({ memoryPressure: true, tabs })).toEqual([
      { tabId: "old", windowId: "w1" },
      { tabId: "mid", windowId: "w1" },
    ]);
  });
});
