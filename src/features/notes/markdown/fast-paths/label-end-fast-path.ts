/**
 * Purpose: settle a `]` that nothing can close in O(1) amortized, instead of
 * letting micromark walk back through the whole paragraph to find that out.
 */
import {
  onlyModelledConstructs,
  type Construct,
  type Effects,
  type Event,
  type ParseContext,
  type State,
  type TokenizeContext,
} from "./micromark-types";

const RIGHT_SQUARE_BRACKET = 93;
const NAME = "aurisInertLabelEnd";
const MODELLED: ReadonlySet<string> = new Set([NAME, "labelEnd", "gfmPotentialFootnoteCall"]);

/** Tokens `labelEnd` accepts as an opener (when not `_balanced`). */
const LABEL_STARTS: ReadonlySet<string> = new Set(["labelLink", "labelImage"]);

interface Watch {
  index: number;
  event: Event;
}

/** Incremental index over ONE tokenizer's event list. */
interface OpenerIndex {
  /** Events `[0, scanned)` are reflected in `openers`. */
  scanned: number;
  /** `events[scanned - 1]` when indexed — the backstop's sentinel. */
  tail: Event | undefined;
  /** Ascending enter-event indices of label starts not yet seen balanced. */
  openers: number[];
  /** Where a deferred `]` could have let a stock resolver splice. */
  watches: Watch[];
}

const indexes = new WeakMap<Event[], OpenerIndex>();
const modelledAtBracket = new WeakMap<ParseContext, boolean>();

/** Bring the index up to date with `events`, re-indexing whatever changed. */
function syncIndex(events: Event[]): OpenerIndex {
  let index = indexes.get(events);
  if (!index) {
    index = { scanned: 0, tail: undefined, openers: [], watches: [] };
    indexes.set(events, index);
  }

  let from = index.scanned;
  for (const watch of index.watches) {
    if (events[watch.index] !== watch.event) from = Math.min(from, watch.index);
  }
  index.watches = [];
  const untouched =
    from === index.scanned &&
    (index.scanned === 0 || (index.scanned <= events.length && events[index.scanned - 1] === index.tail));
  if (!untouched && from === index.scanned) from = 0; // backstop: an unexplained rewrite
  from = Math.min(from, events.length);

  if (from < index.scanned) {
    while (index.openers.length > 0 && (index.openers.at(-1) as number) >= from) index.openers.pop();
    index.scanned = from;
  }
  for (let i = index.scanned; i < events.length; i += 1) {
    const [kind, token] = events[i];
    if (kind === "enter" && LABEL_STARTS.has(token.type)) index.openers.push(i);
  }
  index.scanned = events.length;
  index.tail = events[events.length - 1];
  return index;
}

function tokenizeInertLabelEnd(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  if (!onlyModelledConstructs(modelledAtBracket, this.parser, RIGHT_SQUARE_BRACKET, MODELLED)) {
    return nok;
  }
  const { events } = this;
  const index = syncIndex(events);

  // A label start that failed to match is marked balanced, permanently.
  while (index.openers.length > 0 && events[index.openers.at(-1) as number][1]._balanced) {
    index.openers.pop();
  }
  const opener = index.openers.at(-1);
  if (opener !== undefined) {
    index.watches.push({ index: opener, event: events[opener] });
    return nok;
  }

  return function inertBracket(code) {
    effects.enter("data");
    effects.consume(code);
    effects.exit("data");
    return ok;
  };
}

/** Registered at `]`, ahead of micromark's own constructs. */
export const inertLabelEnd: Construct = {
  name: NAME,
  tokenize: tokenizeInertLabelEnd,
};
