import type { Page } from "@playwright/test";

export async function installBrowserTestBridges(page: Page) {
  await page.addInitScript(() => {
    type Listener = (value: unknown) => void;
    const browserListeners = new Set<Listener>();
    const niaListeners = new Set<Listener>();
    const workflowListeners = new Set<Listener>();
    const commands: Array<{
      command: string;
      payload: Record<string, unknown>;
    }> = [];
    const restarted =
      window.localStorage.getItem("auris-browser-e2e-restarted") === "true";
    const humanTab = {
      active: true,
      automationMode: "Human",
      crashMode: "ok",
      lifecycle: "ready",
      loading: false,
      navigationGeneration: 1,
      tabId: "tab-human",
      title: "Research notes",
      url: "https://example.com/research",
    };
    const snapshot = restarted
      ? {
          bookmarks: [{ title: "Research notes", url: humanTab.url }],
          currentWindowId: "window-one",
          pendingApprovals: [],
          windows: [
            {
              activeTabId: humanTab.tabId,
              tabs: [humanTab],
              windowId: "window-one",
            },
          ],
        }
      : {
          bookmarks: [{ title: "Research notes", url: humanTab.url }],
          currentWindowId: "window-one",
          pendingApprovals: [
            {
              action: "act",
              allowedDecisions: ["deny", "allow_once"],
              approvalId: "approval-e2e",
              expiresAt: Date.now() + 120_000,
              operation: "click",
              origin: "https://example.com",
              tabId: humanTab.tabId,
              target: { kind: "ref", ref: "target-0123456789abcdef01234567" },
              windowId: "window-one",
            },
          ],
          windows: [
            {
              activeTabId: humanTab.tabId,
              tabs: [
                humanTab,
                {
                  active: false,
                  automationMode: "AiSandbox",
                  crashMode: "manual-only",
                  lifecycle: "crashed",
                  loading: false,
                  navigationGeneration: 4,
                  tabId: "tab-crashed",
                  title: "Crashed tab",
                  url: "https://example.com/crashed",
                },
              ],
              windowId: "window-one",
            },
            {
              activeTabId: "tab-second-window",
              tabs: [
                {
                  active: true,
                  automationMode: "AiShared",
                  crashMode: "ok",
                  lifecycle: "ready",
                  loading: false,
                  navigationGeneration: 1,
                  tabId: "tab-second-window",
                  title: "Shared research",
                  url: "https://example.org/shared",
                },
              ],
              windowId: "window-two",
            },
          ],
        };

    const publishBrowser = () => {
      for (const listener of browserListeners)
        listener(structuredClone(snapshot));
    };
    const currentWindow = () =>
      snapshot.windows.find(
        (entry) => entry.windowId === snapshot.currentWindowId,
      ) ?? null;

    Object.defineProperty(window, "aurisBrowser", {
      configurable: true,
      value: {
        async invoke(command: string, payload: Record<string, unknown> = {}) {
          commands.push({ command, payload: structuredClone(payload) });
          if (command === "getSnapshot") return structuredClone(snapshot);
          if (command === "resolveApproval") {
            snapshot.pendingApprovals = snapshot.pendingApprovals.filter(
              (entry) => entry.approvalId !== payload.approvalId,
            );
          } else if (command === "activateTab") {
            const owner = currentWindow();
            if (owner) {
              owner.activeTabId = String(payload.tabId);
              for (const tab of owner.tabs)
                tab.active = tab.tabId === payload.tabId;
            }
          } else if (command === "closeTab") {
            const owner = currentWindow();
            if (owner) {
              owner.tabs = owner.tabs.filter(
                (tab) => tab.tabId !== payload.tabId,
              );
              owner.activeTabId = owner.tabs[0]?.tabId ?? null;
              for (const tab of owner.tabs)
                tab.active = tab.tabId === owner.activeTabId;
            }
          } else if (
            command === "createTab" ||
            command === "createTabInWindow"
          ) {
            const owner =
              command === "createTabInWindow"
                ? snapshot.windows.find(
                    (entry) => entry.windowId === payload.windowId,
                  )
                : currentWindow();
            if (owner) {
              const tabId = `tab-created-${commands.length}`;
              for (const tab of owner.tabs) tab.active = false;
              owner.tabs.push({
                active: true,
                automationMode: String(payload.automationMode ?? "Human"),
                crashMode: "ok",
                lifecycle: "ready",
                loading: false,
                navigationGeneration: 0,
                tabId,
                title: "New tab",
                url: "https://example.com/new",
              });
              owner.activeTabId = tabId;
            }
          } else if (command === "navigate") {
            const owner = currentWindow();
            const tab = owner?.tabs.find(
              (entry) => entry.tabId === payload.tabId,
            );
            if (tab) {
              tab.url = String(payload.url);
              tab.navigationGeneration += 1;
              snapshot.pendingApprovals = [];
            }
          } else if (command === "bookmark") {
            const owner = currentWindow();
            const tab = owner?.tabs.find(
              (entry) => entry.tabId === (payload.tabId ?? owner.activeTabId),
            );
            if (tab) snapshot.bookmarks = [{ title: tab.title, url: tab.url }];
          } else if (command === "removeBookmark") {
            snapshot.bookmarks = snapshot.bookmarks.filter(
              (entry) => entry.url !== payload.url,
            );
          }
          publishBrowser();
          return structuredClone(snapshot);
        },
        subscribe(listener: Listener) {
          browserListeners.add(listener);
          return true;
        },
        unsubscribe(listener: Listener) {
          return browserListeners.delete(listener);
        },
      },
    });

    Object.defineProperty(window, "aurisNia", {
      configurable: true,
      value: {
        async invoke(command: string) {
          if (command === "listProviders") {
            return {
              activeProviderId: "local-e2e",
              providers: [
                {
                  defaultModel: "fixture",
                  enabled: true,
                  id: "local-e2e",
                  kind: "rest",
                  label: "Local fixture",
                  supportedModels: ["fixture"],
                },
              ],
            };
          }
          if (command === "start")
            return {
              model: "fixture",
              providerId: "local-e2e",
              runId: "nia-e2e",
            };
          return { ok: true };
        },
        subscribe(listener: Listener) {
          niaListeners.add(listener);
          return true;
        },
        unsubscribe(listener: Listener) {
          return niaListeners.delete(listener);
        },
      },
    });

    Object.defineProperty(window, "aurisWorkflows", {
      configurable: true,
      value: {
        async invoke(command: string, payload: Record<string, unknown> = {}) {
          if (command === "list") return { browser_markdown: [], nia_yaml: [] };
          if (command === "validate") return { valid: true };
          if (command === "start") {
            return {
              currentStep: 1,
              family: payload.family,
              runId: "workflow-e2e",
              status: "running",
            };
          }
          if (command === "cancel") {
            return {
              currentStep: null,
              family: payload.family,
              runId: "workflow-e2e",
              status: "cancelled",
            };
          }
          return {
            currentStep: 1,
            family: payload.family,
            runId: "workflow-e2e",
            status: "running",
          };
        },
        subscribe(listener: Listener) {
          workflowListeners.add(listener);
          return true;
        },
        unsubscribe(listener: Listener) {
          return workflowListeners.delete(listener);
        },
      },
    });

    (
      window as Window & {
        __browserE2E?: { commands: typeof commands; restart(): void };
      }
    ).__browserE2E = {
      commands,
      restart() {
        window.localStorage.setItem("auris-browser-e2e-restarted", "true");
      },
    };
  });
}
