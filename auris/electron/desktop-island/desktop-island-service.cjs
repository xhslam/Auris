const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  normalizeDesktopIslandSettings,
  normalizeDesktopIslandSnapshot,
  semanticSnapshotFingerprint,
} = require("./desktop-island-contract.cjs");

const EXPAND_DELAY_MS = 300;
const COLLAPSE_DELAY_MS = 420;
const MAX_PENDING_INTENTS = 16;

class DesktopIslandService {
  constructor({ cachePath, nativeHost, settings, onIntent, onOpenHome, onOpenReview }) {
    this.cachePath = cachePath;
    this.nativeHost = nativeHost;
    this.settings = normalizeDesktopIslandSettings(settings);
    this.onIntent = onIntent;
    this.onOpenHome = onOpenHome;
    this.onOpenReview = onOpenReview;
    this.snapshot = null;
    this.fingerprint = null;
    this.dismissedFingerprint = null;
    this.expanded = false;
    this.hovered = false;
    this.revision = 0;
    this.timer = null;
    this.pendingIntents = [];
  }

  start() {
    this.loadCache();
    this.nativeHost.onEvent = (event) => this.handleNativeEvent(event);
    this.nativeHost.start();
    this.publish();
  }

  syncSnapshot(input) {
    const snapshot = normalizeDesktopIslandSnapshot(input);
    const fingerprint = semanticSnapshotFingerprint(snapshot);
    if (fingerprint !== this.fingerprint) {
      this.dismissedFingerprint = null;
      this.fingerprint = fingerprint;
      this.snapshot = snapshot;
      this.revision += 1;
      this.persistCache();
      this.publish();
    } else {
      this.snapshot = snapshot;
    }
    return { accepted: true, revision: this.revision };
  }

  getSettings() {
    return { ...this.settings };
  }

  getSnapshot() {
    return this.snapshot ? structuredClone(this.snapshot) : null;
  }

  updateSettings(patch) {
    this.settings = normalizeDesktopIslandSettings({ ...this.settings, ...patch }, this.settings);
    if (!this.settings.enabled) this.expanded = false;
    this.publish();
    return this.getSettings();
  }

  listPendingIntents() {
    return this.pendingIntents.map((intent) => ({ ...intent }));
  }

  acknowledgeIntent(actionId) {
    this.pendingIntents = this.pendingIntents.filter((item) => item.actionId !== actionId);
  }

  handleNativeEvent(event) {
    if (!event || typeof event !== "object" || typeof event.action !== "string") return;
    if (event.action === "hovered" && typeof event.value === "boolean") {
      this.hovered = event.value;
      if (this.settings.expandOnHover) this.scheduleExpanded(event.value);
      return;
    }
    if (event.action === "set-expanded" && typeof event.value === "boolean") {
      this.clearTimer();
      this.expanded = event.value;
      this.publish();
      return;
    }
    if (event.action === "dismiss") {
      this.dismissedFingerprint = this.fingerprint;
      this.expanded = false;
      this.publish();
      return;
    }
    if (event.action === "open-home") {
      void this.onOpenHome();
      return;
    }
    if (event.action === "open-review") {
      const id = this.snapshot?.review.items[0]?.knowledgePointId;
      void this.onOpenReview(id || null);
      return;
    }
    if (event.action === "set-task-done") {
      const task = this.snapshot?.tasks.items.find((item) => item.id === event.taskId);
      if (!task || typeof event.done !== "boolean") return;
      const intent = {
        actionId: crypto.randomUUID(),
        done: event.done,
        name: "set-task-done",
        taskId: task.id,
      };
      this.pendingIntents = [...this.pendingIntents, intent].slice(-MAX_PENDING_INTENTS);
      this.onIntent(intent);
    }
  }

  scheduleExpanded(expanded) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.expanded = expanded;
      this.publish();
    }, expanded ? EXPAND_DELAY_MS : COLLAPSE_DELAY_MS);
  }

  currentPresentation() {
    const hasContent = Boolean(
      this.snapshot
      && (this.snapshot.tasks.total > 0
        || this.snapshot.review.actionableCount > 0
        || this.snapshot.review.completedToday > 0),
    );
    if (!this.settings.enabled || !hasContent || this.dismissedFingerprint === this.fingerprint) {
      return "hidden";
    }
    return this.expanded ? "expanded" : "compact";
  }

  publish() {
    this.nativeHost.send({
      content: this.snapshot,
      presentation: this.currentPresentation(),
      protocol: 1,
      revision: this.revision,
      settings: this.settings,
      type: "snapshot",
    });
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  loadCache() {
    if (!this.cachePath) return;
    try {
      const cached = normalizeDesktopIslandSnapshot(JSON.parse(fs.readFileSync(this.cachePath, "utf8")));
      this.snapshot = cached;
      this.fingerprint = semanticSnapshotFingerprint(cached);
    } catch {}
  }

  persistCache() {
    if (!this.cachePath || !this.snapshot) return;
    try {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(this.snapshot), { mode: 0o600 });
    } catch {}
  }

  dispose() {
    this.clearTimer();
    this.nativeHost.dispose();
  }
}

module.exports = { DesktopIslandService };
