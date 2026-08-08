export type NotesTextMetrics = {
  characters: number;
  words: number;
};

function stripMarkdownForMetrics(source: string) {
  return source
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^>\s+/gm, "")
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "");
}

export function getNotesTextMetrics(source: string): NotesTextMetrics {
  const visibleText = stripMarkdownForMetrics(source);
  const cjkCharacters = visibleText.match(/[\u3400-\u9fff]/g) ?? [];
  const latinWords = visibleText.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) ?? [];

  return {
    characters: Array.from(visibleText.replace(/\s/g, "")).length,
    words: cjkCharacters.length + latinWords.length,
  };
}
