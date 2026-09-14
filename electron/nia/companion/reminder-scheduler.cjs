"use strict";

const MINUTE_MS = 60_000;

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function minutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function parseClock(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function normalizeTimes(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(parseClock).filter((value) => value !== null))].sort((a, b) => a - b);
}

function inQuietHours(now, start, end) {
  const begin = parseClock(start);
  const finish = parseClock(end);
  if (begin === null || finish === null || begin === finish) return false;
  const current = minutes(now);
  return begin < finish ? current >= begin && current < finish : current >= begin || current < finish;
}

function createReminderScheduler({
  times = ["09:00", "14:00", "20:00"],
  dndStart = "23:00",
  dndEnd = "07:30",
  now = () => new Date(),
  getPending = () => ({ count: 0, items: [] }),
  onReminder = () => undefined,
  state = {},
  saveState = () => undefined,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  const slots = normalizeTimes(times);
  let timer = null;
  let running = false;
  let lastFired = state && typeof state.lastFired === "object" ? { ...state.lastFired } : {};

  function isQuiet(date) { return inQuietHours(date, dndStart, dndEnd); }
  function pending() {
    try {
      const result = getPending();
      if (!result || Number(result.count) <= 0) return { count: 0, items: [] };
      return { count: Math.min(100_000, Math.max(0, Number(result.count) || 0)), items: Array.isArray(result.items) ? result.items.slice(0, 32) : [] };
    } catch { return { count: 0, items: [] }; }
  }
  function mark(day, slot) {
    lastFired = { ...lastFired, [day]: slot };
    const keys = Object.keys(lastFired).sort().slice(-7);
    lastFired = Object.fromEntries(keys.map((key) => [key, lastFired[key]]));
    saveState({ lastFired: { ...lastFired } });
  }
  function fire(slot, reason) {
    const current = now();
    const day = dateKey(current);
    if (isQuiet(current) || lastFired[day] === slot) return false;
    const value = pending();
    if (value.count <= 0) { mark(day, slot); return false; }
    mark(day, slot);
    try { onReminder({ ...value, reason, slot, dateKey: day }); } catch { /* Reminders are best effort. */ }
    return true;
  }
  function catchUp() {
    const current = now();
    if (isQuiet(current)) return false;
    const day = dateKey(current);
    const currentMinute = minutes(current);
    const due = slots.filter((slot) => slot <= currentMinute);
    if (slots.length === 0 || lastFired[day] !== undefined) return false;
    return fire(due.length > 0 ? due[due.length - 1] : slots[slots.length - 1], "catch-up");
  }
  function tick() {
    if (!running) return;
    const current = now();
    const currentMinute = minutes(current);
    for (const slot of slots) {
      if (slot === currentMinute) fire(slot, "scheduled");
    }
    timer = setTimeoutImpl(tick, Math.max(1_000, MINUTE_MS - (current.getSeconds() * 1_000 + current.getMilliseconds())));
  }
  function start() {
    if (running) return;
    running = true;
    catchUp();
    tick();
  }
  function stop() {
    running = false;
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  }
  function update(next = {}) {
    if (Array.isArray(next.times) || typeof next.dndStart === "string" || typeof next.dndEnd === "string") {
      // A settings update is applied by constructing a new scheduler; this
      // method intentionally only exposes operational state for diagnostics.
      return false;
    }
    return true;
  }
  return Object.freeze({ catchUp, fire, isQuiet, start, stop, update, state: () => ({ lastFired: { ...lastFired }, running }) });
}

module.exports = { createReminderScheduler, dateKey, inQuietHours, normalizeTimes, parseClock };
