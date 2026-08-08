async function aurisObservePage(args) {
  "use strict";

  const root = document.documentElement;
  const maxNodes = Math.max(0, Math.min(2_000, Number(args.maxNodes) || 2_000));
  const maxMarkdownChars = Math.max(
    0,
    Math.min(200_000, Number(args.maxMarkdownChars) || 200_000),
  );
  const maxRefs = Math.max(1, Math.min(4_096, Number(args.maxRefs) || 4_096));
  const scopeKey = String(args.scopeKey || "");
  const stores = globalThis.__aurisBrowserRefStores
    || (globalThis.__aurisBrowserRefStores = new Map());
  let store = stores.get(scopeKey);
  if (!store) {
    store = {
      byElement: new WeakMap(),
      byRef: new Map(),
      next: 0,
      order: new Map(),
    };
    stores.clear();
    stores.set(scopeKey, store);
  }

  function refFor(element) {
    const existing = store.byElement.get(element);
    if (existing && store.byRef.has(existing)) return existing;
    const prune = (limit) => {
      const refs = store.order.keys();
      for (let checked = 0; checked < limit; checked += 1) {
        const next = refs.next();
        if (next.done) break;
        const ref = next.value;
        const retainedElement = store.byRef.get(ref)?.deref();
        if (!retainedElement?.isConnected || retainedElement.ownerDocument !== document) {
          store.byRef.delete(ref);
          store.order.delete(ref);
        }
      }
    };
    prune(1);
    while (store.order.size >= maxRefs) {
      const oldest = store.order.keys().next().value;
      store.order.delete(oldest);
      store.byRef.delete(oldest);
    }
    const ref = `g${Number(args.generation) || 0}:e${store.next += 1}`;
    store.byElement.set(element, ref);
    store.byRef.set(ref, new WeakRef(element));
    store.order.set(ref, true);
    return ref;
  }

  function byRef(ref) {
    const element = store.byRef.get(ref)?.deref();
    return element?.isConnected && element.ownerDocument === document ? element : null;
  }

  function hidden(element) {
    for (let node = element; node; node = node.parentElement) {
      if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") {
        return true;
      }
      const style = globalThis.getComputedStyle?.(node);
      if (style?.display === "none" || style?.visibility === "hidden") return true;
    }
    return false;
  }

  function disabled(element) {
    return element.hasAttribute("disabled")
      || element.getAttribute("aria-disabled") === "true"
      || element.matches?.(":disabled") === true;
  }

  function roleFor(element) {
    const explicit = element.getAttribute("role")?.trim().toLowerCase().split(/\s+/u)[0];
    if (explicit) return explicit === "none" || explicit === "presentation" ? null : explicit;
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/u.test(tag)) return "heading";
    if (tag === "button") return "button";
    if (tag === "a" && element.hasAttribute("href")) return "link";
    if (tag === "textarea") return "textbox";
    if (tag === "select") {
      return element.hasAttribute("multiple") || Number(element.getAttribute("size") || "1") > 1
        ? "listbox"
        : "combobox";
    }
    if (tag === "img") return "img";
    if (tag === "main") return "main";
    if (tag === "nav") return "navigation";
    if (tag === "input") {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (type === "hidden") return null;
      if (type === "checkbox" || type === "radio") return type;
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      if (type === "search") return "searchbox";
      return "textbox";
    }
    return null;
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/gu, " ").trim();
  }

  function accessibleName(element) {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const value = normalize(labelledBy.split(/\s+/u)
        .map((id) => document.getElementById(id)?.textContent || "").join(" "));
      if (value) return value;
    }
    const aria = normalize(element.getAttribute("aria-label"));
    if (aria) return aria;
    if (element.tagName === "IMG") return normalize(element.getAttribute("alt"));
    if (element.labels?.length) {
      const labels = normalize(Array.from(element.labels, (label) => label.textContent || "").join(" "));
      if (labels) return labels;
    }
    const wrappingLabel = element.closest("label");
    if (wrappingLabel) {
      const label = normalize(wrappingLabel.textContent);
      if (label) return label;
    }
    if (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) {
      const type = (element.getAttribute("type") || "").toLowerCase();
      if (type === "image") {
        const alt = normalize(element.getAttribute("alt"));
        if (alt) return alt;
      }
      const placeholder = normalize(element.getAttribute("placeholder"));
      if (placeholder) return placeholder;
      if (["submit", "button", "reset", "image"].includes(type)) {
        const value = normalize(element.getAttribute("value"));
        if (value) return value;
      }
    }
    const role = roleFor(element);
    if (role === "main" || role === "navigation") {
      return normalize(element.getAttribute("title"));
    }
    return normalize(element.textContent || element.getAttribute("title"));
  }

  function resolveTarget(target) {
    if (!target || typeof target !== "object") return null;
    if (target.kind === "ref") return byRef(String(target.ref || ""));
    if (target.kind !== "selector") return null;
    try {
      return document.querySelector(String(target.selector || ""));
    } catch {
      return null;
    }
  }

  function targetResult(element) {
    if (!element || !element.isConnected) return { found: false };
    const rect = element.getBoundingClientRect?.();
    return {
      disabled: disabled(element),
      found: true,
      generation: args.generation,
      hidden: hidden(element),
      name: accessibleName(element).slice(0, 1_024),
      rect: rect ? {
        height: Math.max(0, Math.round(rect.height)),
        width: Math.max(0, Math.round(rect.width)),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
      } : undefined,
      ref: refFor(element),
      role: roleFor(element) || "generic",
    };
  }

  function escapeText(text) {
    return text
      .replace(/\\/gu, "\\\\")
      .replace(/([`*_[\]<])/gu, "\\$1")
      .replace(/^(\s*)([-+>#])/u, "$1\\$2")
      .replace(/^(\s*)(\d+)\./u, "$1$2\\.");
  }

  const encoder = new TextEncoder();

  function utf8Length(value) {
    return encoder.encode(String(value || "")).byteLength;
  }

  function truncateUtf8(value, maxBytes) {
    const text = String(value || "");
    if (utf8Length(text) <= maxBytes) return text;
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (utf8Length(text.slice(0, middle)) <= maxBytes) low = middle;
      else high = middle - 1;
    }
    let bounded = text.slice(0, low);
    if (/^[\uDC00-\uDFFF]/u.test(text.slice(low, low + 1))) bounded = bounded.slice(0, -1);
    return bounded;
  }

  function safePrefix(value, end) {
    let prefix = String(value || "").slice(0, end);
    if (/[\uD800-\uDBFF]$/u.test(prefix)) prefix = prefix.slice(0, -1);
    return prefix;
  }

  function longestBacktickRun(value) {
    const runs = String(value || "").match(/`+/gu);
    return runs ? Math.max(...runs.map((run) => run.length)) : 0;
  }

  function markdownDestination(value) {
    try {
      const url = new URL(value, document.location.href).href;
      return /[()\s]/u.test(url) ? `<${url}>` : url;
    } catch {
      return value;
    }
  }

  function serializeChildren(element) {
    return Array.from(element.childNodes, serializeNode).join("");
  }

  function serializeTable(table) {
    const rows = Array.from(table.querySelectorAll("tr"), (row) =>
      Array.from(row.children)
        .filter((cell) => ["TD", "TH"].includes(cell.tagName))
        .map((cell) => serializeChildren(cell).trim().replace(/\|/gu, "\\|")),
    );
    if (rows.length === 0) return "";
    const width = Math.max(1, ...rows.map((row) => row.length));
    const pad = (row) => Array.from({ length: width }, (_, index) => row[index] || "");
    const header = pad(rows[0]);
    const body = rows.slice(1).map(pad);
    return `\n\n| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |\n${body
      .map((row) => `| ${row.join(" | ")} |`).join("\n")}\n\n`;
  }

  function serializeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeText((node.textContent ?? "").replace(/\s+/gu, " "));
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node;
    const tag = element.tagName.toLowerCase();
    if (["script", "style", "noscript", "template", "svg", "iframe", "form"].includes(tag)) {
      return "";
    }
    if (/^h[1-6]$/u.test(tag)) {
      return `\n\n${"#".repeat(Number(tag.slice(1)))} ${serializeChildren(element).trim()}\n\n`;
    }
    if (tag === "p") return `\n\n${serializeChildren(element).trim()}\n\n`;
    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") return `**${serializeChildren(element).trim()}**`;
    if (tag === "em" || tag === "i") return `*${serializeChildren(element).trim()}*`;
    if (tag === "code" && element.parentElement?.tagName !== "PRE") {
      const code = element.textContent || "";
      const fence = "`".repeat(longestBacktickRun(code) + 1);
      const padding = code.startsWith("`") || code.endsWith("`") ? " " : "";
      return `${fence}${padding}${code}${padding}${fence}`;
    }
    if (tag === "pre") {
      const code = String(element.textContent || "").replace(/\n+$/u, "");
      const fence = "`".repeat(Math.max(3, longestBacktickRun(code) + 1));
      return `\n\n${fence}\n${code}\n${fence}\n\n`;
    }
    if (tag === "a") {
      const text = serializeChildren(element).trim();
      const href = element.getAttribute("href");
      return href ? `[${text}](${markdownDestination(href)})` : text;
    }
    if (tag === "img") {
      const src = element.getAttribute("src");
      if (!src) return "";
      return `![${escapeText(normalize(element.getAttribute("alt")))}](${markdownDestination(src)})`;
    }
    if (tag === "blockquote") {
      const quote = serializeChildren(element).trim().split("\n")
        .map((line) => line ? `> ${line}` : ">")
        .join("\n");
      return `\n\n${quote}\n\n`;
    }
    if (tag === "hr") return "\n\n---\n\n";
    if (tag === "ul" || tag === "ol") {
      const items = Array.from(element.children).filter((child) => child.tagName === "LI");
      return `\n\n${items.map((item, index) =>
        `${tag === "ol" ? `${index + 1}.` : "-"} ${serializeChildren(item).trim()}`).join("\n")}\n\n`;
    }
    if (tag === "table") return serializeTable(element);
    return serializeChildren(element);
  }

  if (args.mode === "query") return targetResult(resolveTarget(args.target));

  const candidates = Array.from(root.querySelectorAll("*"));
  const nodes = [];
  let nodesTruncated = false;
  for (const element of candidates) {
    if (element.closest("iframe, frame, object, embed") || hidden(element)) continue;
    const role = roleFor(element);
    if (!role) continue;
    if (nodes.length >= maxNodes) {
      nodesTruncated = true;
      break;
    }
    const node = {
      generation: args.generation,
      name: accessibleName(element).slice(0, 4_096),
      ref: refFor(element),
      role,
    };
    if (disabled(element)) node.disabled = true;
    if (role === "checkbox" || role === "radio") {
      node.checked = element.tagName === "INPUT"
        ? element.checked === true
        : element.getAttribute("aria-checked") === "true";
    }
    if (role === "heading") {
      node.level = Number(element.tagName.slice(1))
        || Number(element.getAttribute("aria-level"))
        || undefined;
    }
    nodes.push(node);
  }

  const clone = document.cloneNode(true);
  const byline = normalize(clone.querySelector?.(
    "[rel=author], [itemprop=author], .byline, .author",
  )?.textContent).slice(0, 512) || null;
  clone.querySelectorAll?.("script, style, noscript, template, svg, iframe, nav, aside, footer, header, form")
    .forEach((element) => element.remove());
  const contentScore = (element) => Array.from(element.querySelectorAll("p"))
    .reduce((score, paragraph) => score + String(paragraph.textContent || "").trim().length, 0);
  const selectMainContent = () => {
    const semantic = clone.querySelector?.("article") || clone.querySelector?.("main");
    if (semantic && contentScore(semantic) > 0) return semantic;
    let best = null;
    let bestScore = 0;
    clone.querySelectorAll?.("div, section, article, main").forEach((candidate) => {
      const score = contentScore(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    return best || clone.body || null;
  };
  const content = selectMainContent();
  const headingTitle = normalize(content?.querySelector?.("h1")?.textContent);
  const globalHeadingTitle = normalize(clone.querySelector?.("h1")?.textContent);
  const documentTitle = normalize(document.title).split(/\s+[|—–-]\s+/u)[0] || "";
  const title = (headingTitle || globalHeadingTitle || documentTitle).slice(0, 512);
  const rawText = normalize(content?.textContent || "");
  const fullMarkdown = content ? serializeChildren(content)
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim() : "";
  const maxResultBytes = Math.max(
    16_384,
    Math.min(240 * 1_024, Number(args.maxResultBytes) || (240 * 1_024)),
  );
  const makeResult = (markdown) => ({
    byline,
    generation: args.generation,
    markdown,
    nodes: [],
    textLength: rawText.length,
    title,
    truncated: nodesTruncated || markdown !== fullMarkdown,
    url: String(document.location?.href || "").slice(0, 2_048),
  });
  const markdownCandidate = safePrefix(fullMarkdown, maxMarkdownChars);
  // Reserve room for the ARIA projection, but measure the retained Markdown
  // through its final JSON representation. Backslashes, quotes, controls, and
  // non-ASCII text can all occupy more bytes after JSON serialization.
  const markdownResultBudget = Math.floor(maxResultBytes * 0.7);
  let low = 0;
  let high = markdownCandidate.length;
  let markdown = "";
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = safePrefix(markdownCandidate, middle);
    if (utf8Length(JSON.stringify(makeResult(candidate))) <= markdownResultBudget) {
      markdown = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const boundedResult = makeResult(markdown);
  let remainingBytes = maxResultBytes - utf8Length(JSON.stringify(boundedResult));
  for (const node of nodes) {
    const boundedNode = {
      ...node,
      name: truncateUtf8(node.name, 512),
    };
    const nodeBytes = utf8Length(JSON.stringify(boundedNode))
      + (boundedResult.nodes.length === 0 ? 0 : 1);
    if (nodeBytes > remainingBytes) {
      boundedResult.truncated = true;
      break;
    }
    boundedResult.nodes.push(boundedNode);
    remainingBytes -= nodeBytes;
  }
  if (boundedResult.nodes.length < nodes.length) boundedResult.truncated = true;
  return boundedResult;
}
