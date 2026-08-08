"use client";

import { DesktopShowcaseCard } from "@/components/desktop/desktop-showcase-card";
import type { DesktopShowcaseCard as DesktopShowcaseCardData } from "@/components/desktop/desktop-shell-fixtures";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import type { AppWorkspaceId } from "@/features/app-runtime/app-runtime.types";

type DesktopCollectionShellProps = {
  actionLabel?: string;
  activeNavId: string;
  activeWorkspace?: AppWorkspaceId;
  cards: DesktopShowcaseCardData[];
  heading: string;
  summaryItems: Array<{
    detail: string;
    label: string;
    value: string;
  }>;
  subtitle: string;
  title: string;
};

export function DesktopCollectionShell({
  actionLabel = "添加资源",
  activeNavId,
  activeWorkspace = "workspace",
  cards,
  heading,
  summaryItems,
  subtitle,
  title,
}: DesktopCollectionShellProps) {
  return (
    <DesktopAppFrame
      activeNavId={activeNavId}
      activeWorkspace={activeWorkspace}
      subtitle={subtitle}
      title={title}
    >
      <main className="desktop-collection-shell">
        <section className="desktop-page-panel">
          <header className="desktop-page-panel__toolbar">
            <div className="desktop-page-panel__filters">
              <button aria-label="网格视图" className="desktop-page-panel__icon-button" type="button">
                <span aria-hidden="true">▦</span>
              </button>
              <button aria-label="列表视图" className="desktop-page-panel__icon-button" type="button">
                <span aria-hidden="true">☰</span>
              </button>
              <button className="desktop-page-panel__select" type="button">
                更新时间降序
              </button>
              <button className="desktop-page-panel__select" type="button">
                全部语言
              </button>
              <button className="desktop-page-panel__search" type="button">
                搜索
              </button>
            </div>
            <div className="desktop-page-panel__actions">
              <button className="desktop-page-panel__primary" type="button">
                {actionLabel}
              </button>
              <button className="desktop-page-panel__ghost" type="button">
                清理
              </button>
            </div>
          </header>

          <div className="desktop-page-panel__heading">
            <h2>{heading}</h2>
            <p>把资源整理成可浏览、可挑选、可继续练习的桌面库。</p>
          </div>

          <section aria-label="资源概览" className="desktop-page-panel__summary">
            <header className="desktop-page-panel__summary-header">
              <strong>资源概览</strong>
              <span>把导入状态、语言分布和下一步动作放到同一层级。</span>
            </header>
            <div className="desktop-page-panel__summary-grid">
              {summaryItems.map((item) => (
                <article className="desktop-page-panel__summary-card" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="desktop-page-panel__grid">
            {cards.map((item) => (
              <DesktopShowcaseCard compact item={item} key={item.id} />
            ))}
          </div>
        </section>
      </main>
    </DesktopAppFrame>
  );
}
