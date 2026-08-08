const SECRET_KEY = /(?:password|secret|token|authorization|cookie|credential|api[-_]?key|value)/iu;

function redactUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return "[redacted-url]";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch { return value.slice(0, 512); }
}

export function redactWorkflowValue(value: unknown, key = "", depth = 0): unknown {
  if (depth > 8) return "[redacted-depth]";
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") {
    if (/^https?:\/\//iu.test(value)) return redactUrl(value);
    return value.slice(0, 2_000);
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => redactWorkflowValue(entry, key, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([childKey, child]) => [
      childKey,
      redactWorkflowValue(child, childKey, depth + 1),
    ]));
  }
  return value;
}
