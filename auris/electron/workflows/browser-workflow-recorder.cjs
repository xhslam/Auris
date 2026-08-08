"use strict";

const crypto = require("node:crypto");

const INPUT_KINDS = new Set(["password", "file", "auth", "text", "search", "textarea", "contenteditable"]);
const MAX_EVENTS = 200;
const MAX_DESCRIPTOR = 512;

function cleanText(value, limit = MAX_DESCRIPTOR) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "").slice(0, limit);
}

function cleanUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    return url.href.slice(0, 2048);
  } catch { return ""; }
}

function createBrowserWorkflowRecorder({ randomBytes = crypto.randomBytes } = {}) {
  let recording = false;
  const events = [];
  const inputs = new Map();

  function start() { recording = true; return true; }
  function stop() { recording = false; return snapshot(); }

  function captureTrusted(event) {
    if (!recording) return null;
    if (!event || typeof event !== "object" || !["navigation", "action", "input"].includes(event.type)) {
      throw new TypeError("Recorder accepts authoritative navigation/action/input events only.");
    }
    if (events.length >= MAX_EVENTS) throw new RangeError("Workflow recording event limit reached.");
    const eventId = `recorded-${randomBytes(8).toString("hex")}`;
    if (event.type === "input") {
      if (!INPUT_KINDS.has(event.inputKind)) throw new TypeError("Unknown recorded input kind.");
      const slot = `input_${inputs.size + 1}`;
      inputs.set(slot, Object.freeze({
        name: slot,
        type: event.inputKind === "password" || event.inputKind === "auth" || event.inputKind === "file" ? "secret" : "text",
        description: cleanText(event.descriptor || event.inputKind),
      }));
      const recorded = Object.freeze({
        eventId,
        type: "input",
        inputKind: event.inputKind,
        slot,
        target: cleanText(event.target),
        valueMode: "opaque_input",
      });
      events.push(recorded);
      return recorded;
    }
    const recorded = Object.freeze({
      eventId,
      type: event.type,
      action: cleanText(event.action),
      target: cleanText(event.target),
      url: event.type === "navigation" ? cleanUrl(event.url) : undefined,
    });
    events.push(recorded);
    return recorded;
  }

  function approveLiteral({ eventId, value, confirmed }) {
    if (confirmed !== true) throw new TypeError("Literal recording requires explicit per-step confirmation.");
    const index = events.findIndex((event) => event.eventId === eventId && event.type === "input");
    if (index < 0) throw new TypeError("Recorded input event was not found.");
    const current = events[index];
    if (["password", "auth", "file"].includes(current.inputKind)) {
      throw new TypeError("Sensitive input kinds can never be recorded as literals.");
    }
    const literal = cleanText(value, 2_000);
    if (!literal) throw new TypeError("A bounded non-empty literal is required.");
    inputs.delete(current.slot);
    events[index] = Object.freeze({ ...current, valueMode: "reviewed_literal", literal });
    return events[index];
  }

  function snapshot() {
    return Object.freeze({
      recording,
      events: Object.freeze(events.map((event) => Object.freeze({ ...event }))),
      inputs: Object.freeze([...inputs.values()]),
    });
  }

  return Object.freeze({ approveLiteral, captureTrusted, snapshot, start, stop });
}

module.exports = { INPUT_KINDS: Object.freeze([...INPUT_KINDS]), createBrowserWorkflowRecorder };
