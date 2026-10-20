"use strict";

/**
 * Lazy, ordered conversation filing for the Nia companion.
 *
 * The Realtime transport reports events before a person necessarily says
 * anything. Keeping this state machine separate from the SQLite repository
 * makes the Mochi rule explicit: an empty wake is not a conversation.
 */
function createConversationLifecycle({ store, personaId, source = "realtime", keeps = () => true, now = Date.now, log = () => {} } = {}) {
  if (!store || typeof store.begin !== "function" || typeof store.say !== "function") throw new TypeError("A conversation store is required.");
  if (typeof personaId !== "string" || personaId.trim() === "") throw new TypeError("A personaId is required.");
  let conversationId = null;
  let wearing = personaId.trim();
  let saving = true;
  const pendingTools = [];

  function flushTools() {
    if (!conversationId) return;
    for (const tool of pendingTools.splice(0)) store.tool({ conversationId, ...tool });
  }

  function ensure() {
    if (conversationId || !saving || !keeps(wearing)) return conversationId;
    conversationId = store.begin({ personaId: wearing, source, startedAt: now() });
    flushTools();
    log(`conversation begun for ${wearing}`);
    return conversationId;
  }

  function file(speaker, text, metadata = {}) {
    if (!saving || !keeps(wearing)) return false;
    if (typeof text !== "string" || (text.trim() === "" && !metadata.cut)) return false;
    const id = ensure();
    if (!id) return false;
    return store.say({ conversationId: id, speaker, text, at: metadata.at ?? now(), cut: metadata.cut ?? false, responseId: metadata.responseId ?? null, itemId: metadata.itemId ?? null });
  }

  function tool(name, callId, status = "arrived", at = now()) {
    if (typeof name !== "string" || typeof callId !== "string") return false;
    if (!saving || !keeps(wearing)) return false;
    const record = { callId, name, status, at };
    if (!conversationId) {
      pendingTools.push(record);
      return false;
    }
    return store.tool({ conversationId, ...record });
  }

  function end(endedAt = now()) {
    pendingTools.length = 0;
    if (!conversationId) return false;
    store.end(conversationId, endedAt);
    conversationId = null;
    pendingTools.length = 0;
    log("conversation closed");
    return true;
  }

  function wear(nextPersonaId) {
    if (typeof nextPersonaId !== "string" || nextPersonaId.trim() === "") throw new TypeError("A personaId is required.");
    end();
    wearing = nextPersonaId.trim();
  }

  function forget(token) {
    if (conversationId !== token) return;
    conversationId = null;
    pendingTools.length = 0;
  }

  function setSaving(enabled) {
    saving = enabled !== false;
    if (!saving) pendingTools.length = 0;
    return saving;
  }

  return Object.freeze({
    end,
    file,
    forget,
    isLive: () => conversationId !== null,
    liveToken: () => conversationId,
    setSaving,
    tool,
    wear,
  });
}

module.exports = { createConversationLifecycle };
