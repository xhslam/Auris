"use client";
import { useEffect, useState } from "react";
import { appendNiaAuditEvent } from "@/features/nia/nia-audit-log";
import { loadNiaUsage, type NiaUsageSnapshot } from "@/features/nia/nia-usage-store";
import type { NiaRoutingPreference } from "@/features/nia/nia-model-router";
const PREFERENCE_KEY = "auris.nia.routing-preference.v1";
function storageOrNull() { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
export function NiaModelRoutingPanel({ preference, onPreferenceChange }: { preference: NiaRoutingPreference; onPreferenceChange: (value: NiaRoutingPreference) => void }) {
  const [usage, setUsage] = useState<NiaUsageSnapshot>(() => loadNiaUsage());
  useEffect(() => { const refresh = () => setUsage(loadNiaUsage()); window.addEventListener("nia-usage-updated", refresh); return () => window.removeEventListener("nia-usage-updated", refresh); }, []);
  const update = (next: NiaRoutingPreference) => { try { storageOrNull()?.setItem(PREFERENCE_KEY, next); } catch { /* Preference remains in the current independent window. */ } onPreferenceChange(next); appendNiaAuditEvent(storageOrNull(), { category: "model", action: "routing_preference", detail: next === "prefer_cli" ? "User prefers CLI/local text routes when available." : "User restored automatic text routing." }); };
  return <section aria-label="Nia model routing and usage" className="nia-routing"><div><span>Model routing · 模型路由</span><strong>{preference === "prefer_cli" ? "Prefer CLI/local text" : "Automatic routing"}</strong><small>Voice uses GPT Live; text selects an enabled REST provider, or a CLI fallback.</small></div><div className="nia-routing__controls"><button aria-pressed={preference === "auto"} onClick={() => update("auto")} type="button">Auto</button><button aria-pressed={preference === "prefer_cli"} onClick={() => update("prefer_cli")} type="button">Prefer local</button></div><dl><div><dt>REST text</dt><dd>{usage.restRequests}</dd></div><div><dt>CLI text</dt><dd>{usage.cliRequests}</dd></div><div><dt>Live</dt><dd>{usage.liveSessions}</dd></div><div><dt>Fallbacks</dt><dd>{usage.fallbackEvents}</dd></div></dl></section>;
}
export function loadNiaRoutingPreference(): NiaRoutingPreference { try { return storageOrNull()?.getItem(PREFERENCE_KEY) === "prefer_cli" ? "prefer_cli" : "auto"; } catch { return "auto"; } }
