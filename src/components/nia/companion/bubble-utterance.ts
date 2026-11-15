import { createPacer, type Pacer } from "./bubble-pace";

export type Utterance = {
  wrote: (responseId: string, text: string) => void;
  speaks: (responseId: string) => void;
  finished: (responseId: string, interrupted?: boolean) => void;
  step: (dt: number, isSpeaking: boolean) => void;
  text: () => string;
  at: () => number;
  begun: () => boolean;
  done: () => boolean;
  responseId: () => string;
};

export function createUtterance(): Utterance {
  let respId = "";
  let fullText = "";
  let hasBegun = false;
  let isDone = false;
  const pacer: Pacer = createPacer();

  return {
    wrote(id: string, text: string) {
      if (respId !== id) {
        respId = id;
        fullText = text;
        hasBegun = false;
        isDone = false;
        pacer.wrote(text);
      } else {
        fullText = text;
        pacer.wrote(text);
      }
    },
    speaks(id: string) {
      if (respId === id) {
        hasBegun = true;
        pacer.began();
      }
    },
    finished(id: string, interrupted = false) {
      if (respId === id) {
        isDone = true;
        if (interrupted) {
          pacer.cut();
        } else {
          pacer.done();
        }
      }
    },
    step(dt: number, isSpeaking: boolean) {
      pacer.step(dt, isSpeaking);
    },
    text() {
      return fullText;
    },
    at() {
      return pacer.at();
    },
    begun() {
      return hasBegun;
    },
    done() {
      return isDone;
    },
    responseId() {
      return respId;
    },
  };
}
