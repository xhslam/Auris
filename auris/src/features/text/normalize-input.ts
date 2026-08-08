export function normalizeInput(input: string) {
  const normalized = input
    .replace(/\r\n/g, "\n")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!normalized) {
    throw new Error("TEXT_REQUIRED");
  }

  return normalized;
}
