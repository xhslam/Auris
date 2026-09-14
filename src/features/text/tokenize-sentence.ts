const TOKEN_SPLIT_RE = /\s+/;

export function tokenizeSentence(sentence: string) {
  return sentence
    .trim()
    .split(TOKEN_SPLIT_RE)
    .map((token) => token.trim())
    .filter(Boolean);
}
