import { isDense } from "./bubble-wrap";

const CJK_COST = 15.1 / 4.1; // ~3.68

export function wordAt(text: string, index: number): { from: number; to: number } {
  if (!text || index < 0 || index >= text.length) {
    return { from: 0, to: 0 };
  }
  const char = text[index];
  if (isDense(char)) {
    return { from: index, to: index + 1 };
  }
  let from = index;
  while (from > 0 && !/\s/.test(text[from - 1]) && !isDense(text[from - 1])) {
    from--;
  }
  let to = index + 1;
  while (to < text.length && !/\s/.test(text[to]) && !isDense(text[to])) {
    to++;
  }
  return { from, to };
}

export type Pacer = {
  wrote: (text: string) => void;
  began: () => void;
  step: (dt: number, isSpeaking: boolean) => void;
  cut: () => void;
  done: () => void;
  at: () => number;
};

export function createPacer(): Pacer {
  let text = "";
  let currentIndex = 0;
  let budget = 0;
  const rate = 15.1; // chars per second (nominal for non-dense)
  let speaking = false;

  function advanceTo(targetBudget: number): number {
    let acc = 0;
    for (let i = 0; i < text.length; i++) {
      const cost = isDense(text[i]) ? CJK_COST : 1;
      if (acc + cost > targetBudget) {
        return i;
      }
      acc += cost;
    }
    return text.length;
  }

  return {
    wrote(newText: string) {
      text = newText;
    },
    began() {
      speaking = true;
    },
    step(dt: number, isSpeaking: boolean) {
      if (!speaking && !isSpeaking) return;
      budget += dt * rate;
      currentIndex = advanceTo(budget);
    },
    cut() {
      speaking = false;
      currentIndex = text.length;
    },
    done() {
      speaking = false;
      currentIndex = text.length;
    },
    at() {
      return currentIndex;
    },
  };
}
