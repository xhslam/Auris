"use client";

import type { KeyboardEvent } from "react";
import { PlusIcon } from "@/components/auris-ui/auris-icons";
import type { BrowserChromeTab } from "@/features/browser/browser-bridge";

type BrowserTabStripProps = {
  activeTabId: string | null;
  tabs: readonly BrowserChromeTab[];
  onActivate(tabId: string): void;
  onClose(tabId: string): void;
  onCreate(): void;
};

export function BrowserTabStrip({
  activeTabId,
  tabs,
  onActivate,
  onClose,
  onCreate,
}: BrowserTabStripProps) {
  function traverse(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = tabs.length - 1;
    else return;
    event.preventDefault();
    const list = event.currentTarget.closest('[role="tablist"]');
    list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  }

  return (
    <div className="browser-tab-strip">
      <div aria-label="浏览器标签页" className="browser-tab-strip__list" role="tablist">
        {tabs.map((tab, index) => {
          const selected = tab.tabId === activeTabId;
          const title = tab.title.trim() || (tab.url ? "未命名页面" : "新标签页");
          return (
            <div className="browser-tab" data-active={selected} key={tab.tabId}>
              <button
                aria-selected={selected}
                className="browser-tab__target"
                onClick={() => onActivate(tab.tabId)}
                onKeyDown={(event) => traverse(event, index)}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                <span className="browser-tab__title">{title}</span>
                {tab.loading ? <span aria-hidden="true" className="browser-tab__spinner" /> : null}
              </button>
              <button
                aria-label={`关闭 ${title}`}
                className="browser-tab__close"
                onClick={() => onClose(tab.tabId)}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          );
        })}
      </div>
      <button
        aria-label="新建标签页"
        className="browser-chrome-button browser-tab-strip__add"
        onClick={onCreate}
        type="button"
      >
        <PlusIcon aria-hidden="true" size={17} />
      </button>
    </div>
  );
}
