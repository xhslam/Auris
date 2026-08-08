const SENTENCE_MATCH_RE =
  /[^.!?。！？\n]+(?:[.!?。！？]+(?:["'”’)\]]+)?)?|[^.!?。！？\n]+$/g;

function normalizeBlock(block: string) {
  return block.replace(/\s+/g, " ").trim();
}

export function splitIntoSentences(input: string) {
  const blocks = input
    .split(/\n+/)
    .map((block) => normalizeBlock(block))
    .filter(Boolean);

  const sentences = blocks.flatMap((block) => {
    const matched = block.match(SENTENCE_MATCH_RE)?.map((sentence) => sentence.trim());
    return matched?.filter(Boolean) ?? [];
  });

  if (sentences.length > 0) {
    return sentences;
  }

  const fallback = normalizeBlock(input);
  return fallback ? [fallback] : [];
}
