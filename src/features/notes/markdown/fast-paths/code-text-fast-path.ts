/**
 * Purpose: settle a backtick run that no later run can close in O(run length),
 * instead of letting micromark scan to the end of the paragraph to find that out.
 */
import {
  onlyModelledConstructs,
  type Code,
  type Construct,
  type Effects,
  type Event,
  type ParseContext,
  type State,
  type TokenizeContext,
} from "./micromark-types";

const GRAVE_ACCENT = 96;
const NAME = "aurisInertCodeTextSequence";
const CODE_TEXT = "codeText";
const MODELLED: ReadonlySet<string> = new Set([NAME, CODE_TEXT]);

/** Backtick runs after the paragraph's first opener, by length. */
interface RunMemo {
  /** Offset of the opener whose scan built this memo. */
  from: number;
  /** Run length → start offset of the LAST run of that length. */
  lastStart: Map<number, number>;
}

const memos = new WeakMap<Event[], RunMemo>();
const modelledAtGrave = new WeakMap<ParseContext, boolean>();

/** `codeText`'s own `previous`: a run starts where the previous character is
 *  not a backtick, or where that backtick was escaped. */
function previousAllowsCodeText(this: TokenizeContext, code: Code): boolean {
  return code !== GRAVE_ACCENT || this.events[this.events.length - 1][1].type === "characterEscape";
}

function tokenizeInertCodeTextSequence(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  if (!onlyModelledConstructs(modelledAtGrave, this.parser, GRAVE_ACCENT, MODELLED)) return nok;

  const { events, now } = this;
  const opener = now().offset;
  const known = memos.get(events);
  const memo = known && known.from <= opener ? known : undefined;
  const recording: RunMemo = { from: opener, lastStart: new Map() };
  let size = 0;
  let runStart = 0;
  let runSize = 0;
  return openingRun;

  function openingRun(code: Code): State | undefined {
    if (code === GRAVE_ACCENT) {
      if (size === 0) effects.enter("data");
      effects.consume(code);
      size += 1;
      return openingRun;
    }
    if (!memo) return scanBetween(code);
    const last = memo.lastStart.get(size);
    if (last !== undefined && last > opener) return nok(code); // codeText will close
    effects.exit("data");
    return ok(code);
  }

  /** Record every later run to the end of the paragraph, then defer. */
  function scanBetween(code: Code): State | undefined {
    if (code === null) {
      memos.set(events, recording);
      return nok(code);
    }
    if (code === GRAVE_ACCENT) {
      runStart = now().offset;
      runSize = 0;
      return scanRun(code);
    }
    effects.consume(code);
    return scanBetween;
  }

  function scanRun(code: Code): State | undefined {
    if (code === GRAVE_ACCENT) {
      effects.consume(code);
      runSize += 1;
      return scanRun;
    }
    if (runSize === size) return nok(code);
    recording.lastStart.set(runSize, runStart);
    return scanBetween(code);
  }
}

/** Registered at a backtick, ahead of micromark's `codeText`. */
export const inertCodeTextSequence: Construct = {
  name: NAME,
  previous: previousAllowsCodeText,
  tokenize: tokenizeInertCodeTextSequence,
};
