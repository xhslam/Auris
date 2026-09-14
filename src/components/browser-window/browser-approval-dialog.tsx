"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getBrowserBridge,
  type BrowserApprovalDecision,
  type BrowserApprovalDescriptor,
  type BrowserChromeSnapshot,
} from "@/features/browser/browser-bridge";

const OPERATION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  attach: "附着到标签页",
  click: "点击页面",
  eval: "执行脚本",
  key: "按键操作",
  navigate: "打开新页面",
  publish: "保存截图证据",
  read: "读取页面",
  scroll: "滚动页面",
  session: "读写浏览会话",
  style: "修改页面样式",
  type: "输入内容",
  upload: "上传文件",
});

const DECISION_LABELS: Readonly<Record<BrowserApprovalDecision, string>> = Object.freeze({
  allow_once: "仅允许这一次",
  allow_standing: "记住此网站的这项操作",
  attach_once: "挂到此标签（一次）",
  attach_until_navigation: "挂到此标签（直到跳转）",
  deny: "拒绝",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeRefTarget(
  value: unknown,
): value is Readonly<{ kind: "ref"; ref: `target-${string}` }> {
  return isRecord(value)
    && Object.keys(value).length === 2
    && value.kind === "ref"
    && typeof value.ref === "string"
    && /^target-[0-9a-f]{24}$/u.test(value.ref);
}

function isApprovalDecision(value: unknown): value is BrowserApprovalDecision {
  return value === "deny"
    || value === "allow_once"
    || value === "allow_standing"
    || value === "attach_once"
    || value === "attach_until_navigation";
}

function parseApprovals(snapshot: unknown): BrowserApprovalDescriptor[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.pendingApprovals)) return [];
  return snapshot.pendingApprovals.filter((value): value is BrowserApprovalDescriptor =>
    isRecord(value)
    && typeof value.action === "string"
    && typeof value.approvalId === "string"
    && Number.isSafeInteger(value.expiresAt)
    && typeof value.operation === "string"
    && typeof value.origin === "string"
    && typeof value.tabId === "string"
    && typeof value.windowId === "string"
    && (value.destination === undefined || typeof value.destination === "string")
    && (value.target === undefined || isSafeRefTarget(value.target))
    && (
      value.allowedDecisions === undefined
      || (
        Array.isArray(value.allowedDecisions)
        && value.allowedDecisions.every(isApprovalDecision)
      )
    ));
}

export function BrowserApprovalDialog({ host = globalThis }: { host?: unknown }) {
  const [approvals, setApprovals] = useState<BrowserApprovalDescriptor[]>([]);
  const actionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resolvingRef = useRef(false);
  const [resolving, setResolving] = useState(false);
  const bridgeRef = useRef<ReturnType<typeof getBrowserBridge>>(null);
  const approval = approvals[0] ?? null;
  const decisions = useMemo<BrowserApprovalDecision[]>(() => {
    const allowed = approval?.allowedDecisions?.filter(isApprovalDecision) ?? ["deny", "allow_once"];
    return allowed.includes("deny") ? allowed : ["deny", ...allowed];
  }, [approval]);

  const applySnapshot = useCallback((snapshot: BrowserChromeSnapshot) => {
    const current = Date.now();
    setApprovals(parseApprovals(snapshot).filter((entry) => entry.expiresAt > current));
  }, []);

  useEffect(() => {
    const bridge = getBrowserBridge(host);
    bridgeRef.current = bridge;
    if (!bridge) return undefined;
    let receivedSubscription = false;
    const unsubscribe = bridge.subscribe((snapshot) => {
      receivedSubscription = true;
      applySnapshot(snapshot);
    });
    void bridge.getSnapshot().then((snapshot) => {
      if (!receivedSubscription) applySnapshot(snapshot as BrowserChromeSnapshot);
    }).catch(() => {
      if (!receivedSubscription) setApprovals([]);
    });
    return () => {
      unsubscribe();
      bridgeRef.current = null;
    };
  }, [applySnapshot, host]);

  useLayoutEffect(() => {
    if (!approval) return undefined;
    actionRefs.current[0]?.focus();
    const remaining = Math.max(0, approval.expiresAt - Date.now());
    const timeout = window.setTimeout(() => {
      setApprovals((current) => current.filter((entry) => entry.approvalId !== approval.approvalId));
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [approval]);

  const resolve = useCallback(async (decision: BrowserApprovalDecision) => {
    if (!approval || !bridgeRef.current || resolvingRef.current) return;
    if (!decisions.includes(decision)) return;
    resolvingRef.current = true;
    setResolving(true);
    try {
      await bridgeRef.current.resolveApproval({ approvalId: approval.approvalId, decision });
    } catch {
      // Unknown, expired, or invalidated IDs fail closed in main; remove stale chrome state.
    } finally {
      resolvingRef.current = false;
      setResolving(false);
      setApprovals((current) =>
        current.filter((entry) => entry.approvalId !== approval.approvalId));
    }
  }, [approval, decisions]);

  if (!approval) return null;

  return (
    <section
      aria-busy={resolving}
      aria-label="浏览器操作确认"
      aria-modal="true"
      className={`browser-approval-dialog${resolving ? " browser-approval-dialog--busy" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          void resolve("deny");
          return;
        }
        if (event.key !== "Tab" || decisions.length === 0) return;
        const buttons = actionRefs.current.filter(Boolean) as HTMLButtonElement[];
        if (buttons.length === 0) return;
        const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.shiftKey) {
          event.preventDefault();
          const next = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
          buttons[next]?.focus();
        } else {
          event.preventDefault();
          const next = currentIndex >= buttons.length - 1 ? 0 : currentIndex + 1;
          buttons[next]?.focus();
        }
      }}
      role="dialog"
    >
      <div className="browser-approval-dialog__copy">
        <span className="browser-approval-dialog__eyebrow">AI 浏览请求</span>
        <strong>{OPERATION_LABELS[approval.operation] ?? "执行浏览器操作"}</strong>
        <span className="browser-approval-dialog__origin">
          {approval.destination ?? approval.origin}
        </span>
        {approval.target ? (
          <span className="browser-approval-dialog__target">目标标识：{approval.target.ref}</span>
        ) : null}
      </div>
      <div className="browser-approval-dialog__actions">
        {decisions.map((decision, index) => (
          <button
            key={decision}
            className={decision === "allow_once" || decision === "allow_standing"
              ? "browser-approval-dialog__allow"
              : undefined}
            disabled={resolving}
            ref={(node) => {
              actionRefs.current[index] = node;
            }}
            type="button"
            onClick={() => void resolve(decision)}
          >
            {DECISION_LABELS[decision]}
          </button>
        ))}
      </div>
    </section>
  );
}
