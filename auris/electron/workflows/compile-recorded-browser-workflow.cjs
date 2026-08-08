"use strict";

/**
 * Compile a trusted recorder snapshot into browser_markdown source.
 * Opaque input slots become `{input_n}` placeholders; secrets never appear as
 * literals. Navigation/action descriptors stay bounded and credential-free.
 */

function siteFromEvents(events) {
  for (const event of events || []) {
    if (event?.type !== "navigation" || typeof event.url !== "string") continue;
    try {
      const host = new URL(event.url).hostname.toLowerCase();
      if (host) return host;
    } catch {
      // ignore malformed URLs; recorder already filters protocols
    }
  }
  return "example.com";
}

function quote(value) {
  return JSON.stringify(String(value || ""));
}

function compileRecordedBrowserWorkflow(snapshot, { site } = {}) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.events)) {
    throw new TypeError("A recorder snapshot with events is required.");
  }
  const events = snapshot.events;
  const inputs = Array.isArray(snapshot.inputs) ? snapshot.inputs : [];
  const resolvedSite = typeof site === "string" && site.trim() ? site.trim().toLowerCase() : siteFromEvents(events);

  const inputLines = inputs.map((input) => {
    const name = typeof input?.name === "string" ? input.name : "input";
    const type = input?.type === "secret" ? "secret" : "text";
    const lines = [`  ${name}:`, `    type: ${type}`];
    if (typeof input?.description === "string" && input.description) {
      lines.push(`    description: ${JSON.stringify(input.description.slice(0, 120))}`);
    }
    return lines.join("\n");
  });

  const steps = [];
  let stepIndex = 1;
  for (const event of events) {
    if (event.type === "navigation" && event.url) {
      steps.push(`${stepIndex}. action: navigate to ${event.url}`);
      stepIndex += 1;
      continue;
    }
    if (event.type === "action") {
      const action = event.action || "click";
      const target = event.target || "target";
      if (action === "type") {
        steps.push(`${stepIndex}. action: type "" into ${quote(target)}`);
        stepIndex += 1;
      } else if (action === "key") {
        const keyToken = String(target).trim().split(/\s+/u)[0] || "Enter";
        steps.push(`${stepIndex}. confirm: Allow key ${quote(keyToken)}?`);
        stepIndex += 1;
        steps.push(`${stepIndex}. action: key ${keyToken}`);
        stepIndex += 1;
      } else if (action === "scroll") {
        steps.push(`${stepIndex}. action: wait 200`);
        stepIndex += 1;
      } else {
        steps.push(`${stepIndex}. confirm: Allow click ${quote(target)}?`);
        stepIndex += 1;
        steps.push(`${stepIndex}. action: click ${quote(target)}`);
        stepIndex += 1;
      }
      continue;
    }
    if (event.type === "input") {
      const target = event.target || "field";
      const slot = event.slot || "input_1";
      const inputDecl = inputs.find((entry) => entry?.name === slot);
      const isSecret = inputDecl?.type === "secret"
        || event.inputKind === "password"
        || event.inputKind === "auth"
        || event.inputKind === "file";
      if (event.valueMode === "reviewed_literal" && typeof event.literal === "string") {
        steps.push(`${stepIndex}. action: type ${quote(event.literal)} into ${quote(target)}`);
        stepIndex += 1;
      } else {
        if (isSecret) {
          steps.push(`${stepIndex}. confirm: Allow secret input into ${quote(target)}?`);
          stepIndex += 1;
        }
        steps.push(`${stepIndex}. action: type {${slot}} into ${quote(target)}`);
        stepIndex += 1;
      }
    }
  }

  if (steps.length === 0) {
    steps.push("1. confirm: Review the empty recording before running?");
  }

  const frontMatter = [
    "---",
    `site: ${resolvedSite}`,
    ...(inputLines.length > 0
      ? ["inputs:", ...inputLines]
      : ["inputs: {}"]),
    "trigger: manual",
    "---",
    "",
  ];

  return `${frontMatter.concat(steps).join("\n")}\n`;
}

module.exports = {
  compileRecordedBrowserWorkflow,
};
