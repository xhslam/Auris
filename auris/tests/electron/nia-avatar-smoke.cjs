"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const origin = process.env.NIA_SMOKE_ORIGIN || "http://127.0.0.1:3417";
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.__captures = [];
      window.niaCompanion = {
        subscribe() {}, unsubscribe() {}, ready() {}, report() {},
        pointerCapture(value) { window.__captures.push(value); },
        wake() {}, dragBegin() {}, dragTo() {}, dragEnd() {}, showMenu() {},
      };
    });
    const settings = await context.newPage();
    await settings.goto(`${origin}/nia`);
    await settings.getByRole("button", { name: "Nia 设置" }).click();
    const avatar = await context.newPage();
    await avatar.setViewportSize({ width: 320, height: 360 });
    await avatar.goto(`${origin}/nia/companion`);
    await avatar.waitForSelector('.nia-companion__figure[data-expression="sleepy"]');
    await settings.getByRole("button", { name: "生气", exact: true }).click();
    await avatar.waitForSelector('.nia-companion__figure[data-expression="angry"]');
    assert.equal(await avatar.locator(".nia-companion__mouth").evaluate(e => getComputedStyle(e).borderTopWidth), "2px");
    await avatar.screenshot({ path: "docs/nia-mochi-sync/2026-09-08/angry-runtime.png" });
    await settings.getByRole("button", { name: "轻跳", exact: true }).click();
    await avatar.waitForFunction(() => document.querySelector(".nia-companion__rig").getAnimations().length > 0);
    await avatar.waitForFunction(() => document.querySelector(".nia-companion__rig").getAnimations().length === 0);
    await settings.getByRole("button", { name: "轻摆", exact: true }).click();
    await avatar.waitForFunction(() => document.querySelector(".nia-companion__rig").getAnimations().length > 0);
    await settings.getByRole("button", { name: "桌面形象摇摆" }).click();
    await avatar.waitForSelector('.nia-companion__figure[data-drift="false"]');
    await avatar.waitForFunction(() => document.querySelector(".nia-companion__rig").getAnimations().length === 0);
    assert.equal(await avatar.locator(".nia-companion__head").evaluate(e => getComputedStyle(e).animationName), "nia-companion-breathe");
    await avatar.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await avatar.locator(".nia-companion__head").evaluate(e => getComputedStyle(e).animationName), "none");
    await avatar.mouse.move(160, 185);
    await avatar.waitForFunction(() => window.__captures.at(-1) === true);
    await avatar.mouse.move(2, 2);
    await avatar.waitForFunction(() => window.__captures.at(-1) === false);
    await avatar.waitForSelector('.nia-companion__figure[data-expression="sleepy"]');
    console.log("PASS: real Nia settings → cross-window expression/motion; frown; hop completion; drift/reduced-motion precedence; pointer hit/release; timed reset.");
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
