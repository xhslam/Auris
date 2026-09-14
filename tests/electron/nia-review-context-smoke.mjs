"use strict";
import assert from "node:assert/strict";
import { chromium } from "playwright";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const origin = process.env.NIA_SMOKE_ORIGIN || "http://127.0.0.1:3419";
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.__sent = [];
      window.niaCompanion = {
        subscribe(fn) { window.__command = fn; }, unsubscribe() {}, ready() {}, report() {},
        async openSession() { return { ok: true, sessionId: "smoke-session" }; },
        async sdp() { return { ok: true, answer: "mock-sdp" }; }, pointerCapture() {},
      };
      Object.defineProperty(navigator, "mediaDevices", { value: { async getUserMedia() {
        const track = { stop() {}, enabled: true };
        return { getAudioTracks: () => [track], getTracks: () => [track] };
      } } });
      window.RTCPeerConnection = class {
        iceGatheringState = "complete";
        localDescription = { sdp: "mock-offer" };
        addTrack() {} async createOffer() { return { sdp: "mock-offer" }; }
        async setLocalDescription() {} async setRemoteDescription() {} close() {}
        createDataChannel() {
          window.__channel = { readyState: "open", send(value) { window.__sent.push(JSON.parse(value)); }, close() {} };
          return window.__channel;
        }
      };
    });
    const review = await context.newPage();
    await review.goto(`${origin}/review`);
    await review.evaluate(() => {
      const d = new Date();
      const day = [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
      const at = d.toISOString();
      localStorage.setItem("auris.output-review.v1", JSON.stringify({ version: 1,
        projects: [{ id: "project", name: "数学", createdAt: at, updatedAt: at }],
        knowledgePoints: [{ id: "point", title: "特征值", projectId: "project", status: "active", currentStage: "day1", tags: [], startDate: day, createdAt: at, updatedAt: at }],
        cycles: [{ id: "cycle", knowledgePointId: "point", isCurrent: true, startedAt: at, events: [{ id: "event", knowledgePointId: "point", stage: "day1", originalPlannedDate: day, currentPlannedDate: day, status: "pending" }] }],
      }));
    });
    await review.reload();
    await review.getByText("特征值", { exact: true }).first().waitFor();
    const nia = await context.newPage();
    await nia.goto(`${origin}/nia/companion`);
    await nia.waitForFunction(() => typeof window.__command === "function");
    await nia.evaluate(() => window.__command({ type: "open", generation: 1 }));
    await nia.waitForFunction(() => window.__sent.some(e => e.type === "session.update"));
    async function query(callId) {
      return nia.evaluate(id => {
        window.__channel.onmessage({ data: JSON.stringify({ type: "response.function_call_arguments.done", call_id: id, name: "get_today_reviews", arguments: "{}" }) });
        window.__channel.onmessage({ data: JSON.stringify({ type: "response.done" }) });
        return JSON.parse(window.__sent.find(e => e.item?.call_id === id).item.output);
      }, callId);
    }
    const first = await query("before");
    assert.equal(first.actionableCount, 1);
    assert.equal(first.items[0].title, "特征值");
    assert.equal(first.items[0].projectName, "数学");
    await review.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("auris.output-review.v1"));
      state.cycles[0].events[0].status = "completed";
      state.cycles[0].events[0].completedAt = new Date().toISOString();
      localStorage.setItem("auris.output-review.v1", JSON.stringify(state));
    });
    const second = await query("after");
    assert.equal(second.actionableCount, 0);
    assert.equal(second.completedToday, 1);
    console.log("PASS: Review renders shared fixture; companion registers tool; tool returns titles; cross-page completion is read fresh without reload. WebRTC/provider mocked.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
