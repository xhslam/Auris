const IRREGULAR_ENGLISH_LEMMAS: Readonly<Record<string, string>> = {
  children: "child",
  men: "man",
  women: "woman",
  went: "go",
  gone: "go",
  better: "good",
  best: "good",
  worse: "bad",
  worst: "bad",
};

const INFLECTION_EXCEPTIONS = new Set(["news", "series", "species", "status"]);
const CONSONANTS = new Set("bcdfghjklmnpqrstvz");

export function getIrregularEnglishLemma(word: string): string | null {
  return Object.hasOwn(IRREGULAR_ENGLISH_LEMMAS, word)
    ? IRREGULAR_ENGLISH_LEMMAS[word]
    : null;
}

function getUndoubledCandidate(stem: string): string | null {
  const finalLetter = stem.at(-1);

  if (
    finalLetter === undefined ||
    stem.at(-2) !== finalLetter ||
    !CONSONANTS.has(finalLetter)
  ) {
    return null;
  }

  return stem.slice(0, -1);
}

export function getEnglishLemmaCandidates(word: string): string[] {
  if (word.length <= 3 || INFLECTION_EXCEPTIONS.has(word)) {
    return [];
  }

  let candidates: Array<string | null> = [];

  if (word.endsWith("ies")) {
    candidates = [`${word.slice(0, -3)}y`, word.slice(0, -1)];
  } else if (word.endsWith("ied")) {
    candidates = [`${word.slice(0, -3)}y`];
  } else if (word.endsWith("es")) {
    candidates = [word.slice(0, -2), word.slice(0, -1)];
  } else if (
    word.endsWith("s") &&
    !word.endsWith("ss") &&
    !word.endsWith("us") &&
    !word.endsWith("is")
  ) {
    candidates = [word.slice(0, -1)];
  } else if (word.endsWith("ed")) {
    const stem = word.slice(0, -2);
    candidates = [word.slice(0, -1), stem, getUndoubledCandidate(stem)];
  } else if (word.endsWith("ing")) {
    const stem = word.slice(0, -3);
    candidates = [stem, `${stem}e`, getUndoubledCandidate(stem)];
  } else if (word.endsWith("iest")) {
    candidates = [`${word.slice(0, -4)}y`];
  } else if (word.endsWith("ier")) {
    candidates = [`${word.slice(0, -3)}y`];
  } else if (word.endsWith("est")) {
    const stem = word.slice(0, -3);
    candidates = [`${stem}e`, getUndoubledCandidate(stem)];
  } else if (word.endsWith("er")) {
    const stem = word.slice(0, -2);
    candidates = [`${stem}e`, getUndoubledCandidate(stem)];
  }

  return candidates.filter(
    (candidate, index, all): candidate is string =>
      candidate !== null &&
      candidate.length >= 3 &&
      candidate !== word &&
      all.indexOf(candidate) === index,
  );
}
