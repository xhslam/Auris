import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  accessibleName,
  ariaSnapshot,
  computeRole,
  observePage,
  queryByRole,
} from "../../../src/features/browser/page-observation";
import { queryByRef, refFor } from "../../../src/features/browser/stable-refs";

function docWith(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}

function el(html: string): HTMLElement {
  return docWith(html).body.firstElementChild as HTMLElement;
}

function root(html: string): HTMLElement {
  return docWith(html).body;
}

const FIXTURE = readFileSync(
  path.join(process.cwd(), "tests/fixtures/browser/observation-document.html"),
  "utf8",
);

// Cases adapted from VMark `src/lib/browser/agent/refs.test.ts`.
describe("refFor / queryByRef", () => {
  it("assigns monotonic refs in call order (e1, e2, …)", () => {
    const doc = docWith(`<button id="a">A</button><button id="b">B</button>`);
    expect(refFor(doc.getElementById("a")!, 1)).toBe("e1");
    expect(refFor(doc.getElementById("b")!, 1)).toBe("e2");
  });

  it("returns the SAME ref across repeated reads at one generation", () => {
    const doc = docWith(`<button id="a">A</button>`);
    const a = doc.getElementById("a")!;
    const first = refFor(a, 3);
    refFor(doc.createElement("div"), 3);
    expect(refFor(a, 3)).toBe(first);
  });

  it("resolves a ref and rejects unknown / detached / stale-generation refs", () => {
    const doc = docWith(`<button id="a">A</button>`);
    const a = doc.getElementById("a")!;
    const ref = refFor(a, 1);
    expect(queryByRef(doc, ref, 1)).toBe(a);
    expect(queryByRef(doc, "e99", 1)).toBeNull();
    a.remove();
    expect(queryByRef(doc, ref, 1)).toBeNull();
  });

  it("invalidates refs when navigation generation bumps on the same document", () => {
    const doc = docWith(`<button id="a">Old</button>`);
    const a = doc.getElementById("a")!;
    const oldRef = refFor(a, 5);
    expect(queryByRef(doc, oldRef, 5)).toBe(a);
    expect(queryByRef(doc, oldRef, 6)).toBeNull();
    expect(refFor(doc.getElementById("a")!, 6)).toBe("e1");
  });
});

// Cases adapted from VMark `src/lib/browser/agent/aria.test.ts`.
describe("computeRole / accessibleName / queryByRole", () => {
  it("infers roles from tag and attributes", () => {
    expect(computeRole(el(`<button>x</button>`))).toBe("button");
    expect(computeRole(el(`<a href="/x">x</a>`))).toBe("link");
    expect(computeRole(el(`<a>no href</a>`))).toBeNull();
    expect(computeRole(el(`<input type="checkbox">`))).toBe("checkbox");
    expect(computeRole(el(`<input type="hidden">`))).toBeNull();
    expect(computeRole(el(`<div role="presentation">x</div>`))).toBeNull();
  });

  it("prefers aria-labelledby over aria-label and concatenates duplicate labels", () => {
    const labelled = root(
      `<span id="ref">Referenced name</span><button aria-labelledby="ref" aria-label="Direct name">x</button>`,
    );
    expect(accessibleName(labelled.querySelector("button")!)).toBe("Referenced name");

    const multi = root(
      `<label for="e">Email</label><input id="e" type="text"><label for="e">(work)</label>`,
    );
    expect(accessibleName(multi.querySelector("input")!)).toBe("Email (work)");
  });

  it("never returns hidden/disabled-shadowed controls before the visible one", () => {
    const page = root(`
      <div hidden><button>Publish</button></div>
      <div aria-hidden="true"><button>Publish</button></div>
      <div style="display: none"><button>Publish</button></div>
      <div inert><button>Publish</button></div>
      <button id="real">Publish</button>`);
    const found = queryByRole(page, "button", { name: "Publish" });
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe("real");
  });
});

describe("observePage / ariaSnapshot", () => {
  it("stamps generation + stable refs and skips generic containers", () => {
    const page = root(`
      <div><span>plain text</span></div>
      <h1>Welcome</h1>
      <button>OK</button>
      <a href="/x">link</a>`);
    const first = observePage(page, 7);
    expect(first.generation).toBe(7);
    expect(first.truncated).toBe(false);
    expect(first.nodes.every((n) => n.generation === 7)).toBe(true);
    expect(first.nodes.every((n) => /^e\d+$/u.test(n.ref))).toBe(true);
    expect(first.nodes.map((n) => n.role)).toEqual(
      expect.arrayContaining(["heading", "button", "link"]),
    );
    expect(first.nodes.map((n) => n.role)).not.toContain("generic");
    expect(ariaSnapshot(page, 7).map((n) => n.ref)).toEqual(
      first.nodes.map((n) => n.ref),
    );
  });

  it("reports live checked/disabled state including fieldset inheritance", () => {
    const page = root(`
      <input type="checkbox" checked aria-label="Was checked">
      <fieldset disabled><button>Save</button></fieldset>`);
    const checkbox = page.querySelector("input") as HTMLInputElement;
    checkbox.checked = false;
    const snap = observePage(page, 1).nodes;
    expect(snap.find((n) => n.name === "Was checked")?.checked).toBe(false);
    expect(snap.find((n) => n.role === "button")?.disabled).toBe(true);
  });

  it("truncates oversized documents under an explicit budget", () => {
    const buttons = Array.from({ length: 20 }, (_, i) => `<button>B${i}</button>`).join("");
    const page = root(buttons);
    const result = observePage(page, 1, { maxNodes: 5 });
    expect(result.nodes).toHaveLength(5);
    expect(result.truncated).toBe(true);
  });

  it("does not invent iframe contents or walk into iframe light-tree hosts", () => {
    const page = root(`
      <button>Outside</button>
      <iframe id="frame" src="https://evil.example/x" title="evil"></iframe>`);
    const snap = observePage(page, 1);
    expect(snap.nodes.map((n) => n.name)).toEqual(["Outside"]);
    expect(JSON.stringify(snap)).not.toContain("evil.example");
  });

  it("does not pierce open shadow roots", () => {
    const page = root(`<div id="host"></div><button>Light</button>`);
    const host = page.querySelector("#host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button>Shadow secret</button>`;
    const snap = observePage(page, 1);
    expect(snap.nodes.map((n) => n.name)).toEqual(["Light"]);
    expect(snap.nodes.map((n) => n.name)).not.toContain("Shadow secret");
  });

  it("fixture: page text may include secrets, but observation metadata does not duplicate them", () => {
    const doc = new DOMParser().parseFromString(FIXTURE, "text/html");
    const result = observePage(doc.body, 2);
    expect(result.nodes.some((n) => n.role === "button" && n.name === "Publish")).toBe(
      true,
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("hunter2-secret");
    expect(serialized).not.toContain("SECRET_PAGE_TEXT");
    expect(serialized).not.toContain("access_token");
    // Explicit page text still exists on the DOM for a separate read path.
    expect(doc.body.textContent).toContain("access_token=SECRET_PAGE_TEXT");
  });
});
