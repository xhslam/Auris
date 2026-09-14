/**
 * Bounded ARIA page observation for agent perception.
 *
 * Adapted from VMark `src/lib/browser/agent/aria.ts` (xiaolai/vmark@7c409688).
 * Adds explicit budgets and serializable truncation metadata; never crosses
 * iframe or open-shadow boundaries.
 */

import { refFor } from "./stable-refs";

/** A compact accessibility node for the AI to read. */
export type AriaNode = {
  role: string;
  name: string;
  /** Stable handle within the committed page generation. */
  ref: string;
  /** Navigation generation this node was minted against. */
  generation: number;
  level?: number;
  checked?: boolean;
  disabled?: boolean;
};

export type ObservationBudget = {
  /** Maximum AriaNodes to emit; excess are dropped with truncated=true. */
  maxNodes: number;
};

export type AriaSnapshotResult = {
  nodes: AriaNode[];
  truncated: boolean;
  generation: number;
};

const DEFAULT_BUDGET: ObservationBudget = { maxNodes: 2_000 };

const HEADING_TAGS: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

const PRESENTATIONAL: ReadonlySet<string> = new Set(["presentation", "none"]);

const INPUT_ROLES: Record<string, string | null> = {
  checkbox: "checkbox",
  radio: "radio",
  submit: "button",
  button: "button",
  reset: "button",
  image: "button",
  range: "slider",
  number: "spinbutton",
  search: "searchbox",
  hidden: null,
};

export function computeRole(el: Element): string | null {
  const explicit = el.getAttribute("role")?.trim().toLowerCase();
  if (explicit) {
    const first = explicit.split(/\s+/u)[0]!;
    return PRESENTATIONAL.has(first) ? null : first;
  }

  const tag = el.tagName.toLowerCase();
  if (HEADING_TAGS[tag]) return "heading";
  switch (tag) {
    case "button":
      return "button";
    case "a":
      return el.hasAttribute("href") ? "link" : null;
    case "nav":
      return "navigation";
    case "main":
      return "main";
    case "textarea":
      return "textbox";
    case "select":
      return el.hasAttribute("multiple") || Number(el.getAttribute("size") ?? "1") > 1
        ? "listbox"
        : "combobox";
    case "img":
      return "img";
    case "input": {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      return type in INPUT_ROLES ? INPUT_ROLES[type]! : "textbox";
    }
    default:
      return null;
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/gu, " ").trim();
}

function idListText(el: Element, idList: string): string {
  const doc = el.ownerDocument;
  return normalize(
    idList
      .split(/\s+/u)
      .map((id) => doc?.getElementById(id)?.textContent ?? "")
      .join(" "),
  );
}

function labelFor(el: Element): string {
  const labels = (el as Partial<HTMLInputElement>).labels;
  if (labels && labels.length > 0) {
    return normalize(Array.from(labels, (label) => label.textContent ?? "").join(" "));
  }
  const wrapping = el.closest("label");
  return wrapping?.textContent ? normalize(wrapping.textContent) : "";
}

function formControlName(el: Element): string {
  const label = labelFor(el);
  if (label) return label;

  const type = (el.getAttribute("type") ?? "").toLowerCase();
  if (type === "image") {
    const alt = normalize(el.getAttribute("alt") ?? "");
    if (alt) return alt;
  }

  const placeholder = el.getAttribute("placeholder");
  if (placeholder?.trim()) return normalize(placeholder);

  if (type === "submit" || type === "button" || type === "reset" || type === "image") {
    const value = el.getAttribute("value");
    if (value?.trim()) return normalize(value);
  }
  return "";
}

export function accessibleName(el: Element): string {
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const text = idListText(el, labelledby);
    if (text) return text;
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return normalize(ariaLabel);

  const tag = el.tagName.toLowerCase();
  if (tag === "img") return normalize(el.getAttribute("alt") ?? "");

  if (tag === "input" || tag === "textarea" || tag === "select") {
    return formControlName(el);
  }

  // Structural landmarks must not dump the entire descendant text tree into
  // observation metadata (that would duplicate page secrets into every snapshot).
  const role = computeRole(el);
  if (role === "main" || role === "navigation") {
    const title = el.getAttribute("title");
    return title ? normalize(title) : "";
  }

  if (el.textContent?.trim()) return normalize(el.textContent);
  const title = el.getAttribute("title");
  return title ? normalize(title) : "";
}

function isHidden(el: Element): boolean {
  for (let node: Element | null = el; node !== null; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.hasAttribute("inert")) return true;
    if (node.getAttribute("aria-hidden") === "true") return true;
    const style = (node as Partial<HTMLElement>).style;
    if (style && (style.display === "none" || style.visibility === "hidden")) return true;
  }
  return false;
}

function nameMatches(actual: string, wanted: string, exact: boolean): boolean {
  return exact ? actual === wanted : actual.toLowerCase().includes(wanted.toLowerCase());
}

/**
 * Light-DOM only candidates. Does not pierce open shadow roots or iframe documents.
 */
function lightDomCandidates(root: Element): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "iframe" || tag === "frame" || tag === "object" || tag === "embed") {
      return false;
    }
    // Exclude nodes that live under an iframe element in the light tree.
    if (el.closest("iframe, frame, object, embed")) return false;
    return true;
  });
}

export function queryByRole(
  root: Element,
  role: string,
  opts: { name?: string; exact?: boolean } = {},
): Element[] {
  const exact = opts.exact !== false;
  return lightDomCandidates(root).filter(
    (el) =>
      computeRole(el) === role
      && !isHidden(el)
      && (opts.name === undefined || nameMatches(accessibleName(el), opts.name, exact)),
  );
}

function isDisabled(el: Element): boolean {
  if (el.getAttribute("aria-disabled") === "true") return true;
  if (typeof el.matches === "function" && el.matches(":disabled")) return true;
  return el.hasAttribute("disabled");
}

function isChecked(el: Element): boolean {
  if (el.tagName === "INPUT") return (el as HTMLInputElement).checked;
  return el.getAttribute("aria-checked") === "true";
}

/**
 * Render interesting, visible light-DOM elements as accessibility nodes.
 * Respects an explicit budget; stamps each node with generation + stable ref.
 */
export function observePage(
  root: Element,
  generation: number,
  budget: ObservationBudget = DEFAULT_BUDGET,
): AriaSnapshotResult {
  const maxNodes = Math.max(0, Math.floor(budget.maxNodes));
  const nodes: AriaNode[] = [];
  let truncated = false;

  for (const el of lightDomCandidates(root)) {
    const role = computeRole(el);
    if (!role || isHidden(el)) continue;
    if (nodes.length >= maxNodes) {
      truncated = true;
      break;
    }
    const node: AriaNode = {
      role,
      name: accessibleName(el),
      ref: refFor(el, generation),
      generation,
    };
    const level = HEADING_TAGS[el.tagName.toLowerCase()];
    if (role === "heading") {
      node.level = level ?? (Number(el.getAttribute("aria-level")) || undefined);
    }
    if (role === "checkbox" || role === "radio") node.checked = isChecked(el);
    if (isDisabled(el)) node.disabled = true;
    nodes.push(node);
  }

  return { nodes, truncated, generation };
}

/** Back-compat alias matching upstream `ariaSnapshot` shape (nodes only). */
export function ariaSnapshot(
  root: Element,
  generation = 0,
  budget: ObservationBudget = DEFAULT_BUDGET,
): AriaNode[] {
  return observePage(root, generation, budget).nodes;
}
