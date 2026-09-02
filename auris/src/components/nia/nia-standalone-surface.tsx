"use client";
import { useEffect, useState } from "react";
import { NiaPanel } from "@/components/nia/nia-panel";
import { NiaOperationsPanel } from "@/components/nia/nia-operations-panel";
import { NiaLiveSurface } from "@/components/nia/nia-live-surface";
import { NiaModelRoutingPanel, loadNiaRoutingPreference } from "@/components/nia/nia-model-routing-panel";
import { NiaCompanionHistory } from "@/components/nia/nia-companion-history";
import { getNiaStandaloneBridge } from "@/features/nia/nia-standalone-bridge";
import { formatNiaContextCardsForPrompt } from "@/features/nia/nia-context-card";
import { listNiaToolsForContext } from "@/features/nia/nia-tool-registry";
import { useNiaStandaloneStore } from "@/features/nia/nia-standalone-store";

const contextKindLabel = {
  browser: "Page · 页面",
  note: "Note · 笔记",
  reading: "Reading · 阅读",
  video: "Video · 视频",
  workflow: "Workflow · 工作流",
} as const;

export function NiaStandaloneSurface() {
  const activeContextCardId = useNiaStandaloneStore((state) => state.activeContextCardId);
  const browserTarget = useNiaStandaloneStore((state) => state.browserTarget);
  const clearContext = useNiaStandaloneStore((state) => state.clearContext);
  const context = useNiaStandaloneStore((state) => state.context);
  const contextCards = useNiaStandaloneStore((state) => state.contextCards);
  const contextToken = useNiaStandaloneStore((state) => state.contextToken);
  const open = useNiaStandaloneStore((state) => state.open);
  const origin = useNiaStandaloneStore((state) => state.origin);
  const removeContextCard = useNiaStandaloneStore((state) => state.removeContextCard);
  const selectContextCard = useNiaStandaloneStore((state) => state.selectContextCard);
  const [isContextDrawerOpen, setContextDrawerOpen] = useState(false);
  const [memoryContext, setMemoryContext] = useState("");
  const [routingPreference, setRoutingPreference] = useState(loadNiaRoutingPreference);
  const activeCard = contextCards.find((card) => card.id === activeContextCardId) ?? null;
  const tools = listNiaToolsForContext(activeCard).filter((tool) => tool.available);
  const additionalContext = formatNiaContextCardsForPrompt(contextCards, activeContextCardId);
  const persistentContext = [memoryContext, additionalContext].filter(Boolean).join("\n\n---\n\n");

  useEffect(() => {
    const bridge = getNiaStandaloneBridge(window);
    if (!bridge) return;
    return bridge.subscribeLaunch((nextLaunch) => open(nextLaunch));
  }, [open]);

  const browserContextAvailable = context?.kind === "browser_reference" && Boolean(browserTarget);
  return (
    <main className="nia-standalone" data-origin={origin}>
      <header className="nia-standalone__header">
        <div>
          <span className="nia-standalone__eyebrow">Auris independent assistant · 独立助手</span>
          <h1>Nia</h1>
          <p>Think with your work, not inside one page.</p>
        </div>
        <button aria-label="Close Nia window · 关闭 Nia" className="nia-standalone__close" onClick={() => window.close()} type="button">×</button>
      </header>
      <section aria-label="Nia attached context" className="nia-standalone__context-card">
        <div>
          <span>Context card · 上下文卡片</span>
          <strong>{activeCard ? activeCard.title : "No attached context · 无附加上下文"}</strong>
          <small>{activeCard ? `${contextKindLabel[activeCard.kind]} · ${activeCard.summary}` : "Nia can work without a page · 不依赖网页"}</small>
        </div>
        <div className="nia-standalone__context-actions">
          <button aria-expanded={isContextDrawerOpen} onClick={() => setContextDrawerOpen((value) => !value)} type="button">Contexts · ${contextCards.length}</button>
          {contextCards.length > 0 ? <button onClick={clearContext} type="button">Clear · 清除</button> : null}
        </div>
      </section>
      <NiaOperationsPanel onMemoryContextChange={setMemoryContext} />
      <NiaLiveSurface />
      <NiaCompanionHistory />
      <NiaModelRoutingPanel onPreferenceChange={setRoutingPreference} preference={routingPreference} />
      {isContextDrawerOpen ? (
        <aside aria-label="Nia context drawer" className="nia-standalone__context-drawer">
          <div className="nia-standalone__drawer-heading">
            <div><strong>Attached context · 已附加上下文</strong><small>Only explicitly shared items are available to Nia.</small></div>
            <button aria-label="Close context drawer · 关闭上下文抽屉" onClick={() => setContextDrawerOpen(false)} type="button">×</button>
          </div>
          {contextCards.length ? <div className="nia-standalone__context-list" role="list">
            {contextCards.map((card) => <article className="nia-standalone__context-item" data-active={card.id === activeContextCardId} key={card.id} role="listitem">
              <button aria-pressed={card.id === activeContextCardId} className="nia-standalone__context-select" onClick={() => selectContextCard(card.id)} type="button">
                <span>{contextKindLabel[card.kind]}</span><strong>{card.title}</strong><small>{card.summary}</small>
              </button>
              <button aria-label={`Remove ${card.title} · 移除`} className="nia-standalone__context-remove" onClick={() => removeContextCard(card.id)} type="button">×</button>
            </article>)}
          </div> : <p className="nia-standalone__drawer-empty">Attach a note, page, reading selection or video reference when you want Nia to use it.</p>}
          {activeCard ? <section aria-label="Available Nia tools" className="nia-standalone__tool-list"><span>Available tools · 可用工具</span>{tools.map((tool) => <small key={tool.id}><strong>{tool.label}</strong> · {tool.risk} risk{tool.approval === "per-action" ? " · approval required" : ""}</small>)}</section> : null}
        </aside>
      ) : null}
      <section className="nia-standalone__session">
        <NiaPanel browserTarget={browserTarget} externalContext={context} externalContextToken={contextToken} persistentContext={persistentContext} routingPreference={routingPreference} supportedContexts={browserContextAvailable ? ["browser"] : []} />
      </section>
    </main>
  );
}
