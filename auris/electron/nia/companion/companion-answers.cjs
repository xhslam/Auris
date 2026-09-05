"use strict";

/**
 * Dispatcher and typed answer adapter for Nia companion host IPC commands.
 *
 * Derived from Mochi's src/main/ipc/answer.ts at commit 4c1d6f0.
 *
 * Handles the single request/response entry point for host commands:
 * `shadowing:nia-companion:host-command`.
 *
 * Each supported command maps to an answer conforming to `NiaCompanionHostAnswers`
 * in `src/features/nia/nia-companion-answers.ts`.
 */

const NIA_COMPANION_HOST_COMMANDS = Object.freeze([
  "snapshot",
  "conversations",
  "conversation-turns",
  "conversation-detail",
  "conversation-search",
  "conversation-saving",
  "wake",
  "rest",
  "mute",
  "companion-visibility",
  "text",
]);

function createNiaCompanionHostDispatcher({
  getCoordinator,
  getWindow,
  getConversationStore,
  sendHostEvent,
} = {}) {
  return async function dispatchHostCommand(request = {}) {
    const command = typeof request?.command === "string" ? request.command : "";
    const payload = request?.payload && typeof request.payload === "object" ? request.payload : {};
    const coordinator = getCoordinator?.() ?? null;
    const companionWindow = getWindow?.() ?? null;
    const conversationStore = getConversationStore?.() ?? null;

    if (!coordinator) return { state: "resting" };

    switch (command) {
      case "snapshot": {
        const snap = coordinator.snapshot ? coordinator.snapshot() : {};
        return {
          ...snap,
          visible: companionWindow?.isVisible?.() !== false,
        };
      }
      case "conversations": {
        return conversationStore?.list?.({ personaId: "nia", limit: 100 }) ?? [];
      }
      case "conversation-turns": {
        const conversationId = String(payload.conversationId || "");
        return conversationStore?.turns?.({ personaId: "nia", conversationId }) ?? [];
      }
      case "conversation-detail": {
        const conversationId = String(payload.conversationId || "");
        return {
          tools: conversationStore?.tools?.({ personaId: "nia", conversationId }) ?? [],
          turns: conversationStore?.turns?.({ personaId: "nia", conversationId }) ?? [],
        };
      }
      case "conversation-search": {
        const query = String(payload.query || "").trim();
        return query
          ? conversationStore?.search?.({ personaId: "nia", query, limit: 100 }) ?? []
          : [];
      }
      case "conversation-saving": {
        return coordinator.setConversationSaving?.(payload.enabled !== false) ?? false;
      }
      case "wake": {
        return coordinator.open({ reason: "nia-page" });
      }
      case "rest": {
        return coordinator.rest("nia-page");
      }
      case "mute": {
        return coordinator.setMuted?.(payload.muted === true) ?? false;
      }
      case "companion-visibility": {
        const visible = payload.visible !== false;
        if (visible) companionWindow?.show?.();
        else companionWindow?.hide?.();
        sendHostEvent?.({ type: "visibility", visible });
        return visible;
      }
      case "text": {
        return coordinator.sendText(String(payload.text || ""));
      }
      default:
        throw new TypeError(`Unsupported Nia companion host command: ${command}`);
    }
  };
}

module.exports = {
  NIA_COMPANION_HOST_COMMANDS,
  createNiaCompanionHostDispatcher,
};
