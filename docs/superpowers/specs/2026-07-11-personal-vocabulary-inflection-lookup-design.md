# Personal Vocabulary Inflection Lookup Design

## Goal

When a reader looks up an inflected English word such as `duties`, Auris should resolve it to the canonical personal-vocabulary entry `duty` without creating a duplicate Markdown card or duplicate saved-word record.

## Current behavior

The reading surface sends the selected token to `/api/dictionary/lookup`. The personal-vocabulary service lowercases and trims punctuation, then performs an exact `lookupKey` match. Because the index contains `duty` but not `duties`, the request returns `WORD_NOT_FOUND`.

The API route is shared by the desktop reading workbench, desktop video detail view, and reader stage. The fix therefore belongs in the personal-vocabulary lookup service so all three callers receive the same behavior. The route remains local and its request contract does not change.

## Data model

Each Markdown file remains canonical and is named for one lemma, for example `2832-duty.md`. The generated JSON entry keeps `lookupKey: "duty"`. The initial change does not alter the Markdown format, JSON schema, or sync script. Explicit author-defined aliases can be designed separately if real cases remain unresolved after this change.

## Lookup flow

For a normalized input token:

1. Try an exact canonical `lookupKey` match.
2. Check a normalized built-in irregular-form map.
3. Generate conservative lemma candidates using English inflection rules and try them in the fixed order below.
4. Return the first existing canonical entry, preserving its canonical `word` and filename.
5. If no candidate exists, return the existing `WORD_NOT_FOUND` response.

Exact matches always win, followed by built-in irregular forms, followed by heuristics. This prevents a real dictionary entry from being redirected. The irregular map is code-owned, normalized to lowercase, and covered by collision tests; it must never override an exact canonical key.

## Morphology scope

Candidate generation is a pure exported function so it can be tested against small fixture indexes. Suffix families are mutually exclusive: the first matching family in the order below runs, and later families do not. Within that family candidates use the listed order. The function removes duplicates, never emits the original token, and only emits candidates of at least three letters:

- `-ies`: replace with `y`, then remove only `s` (`duties -> duty` before `dutie`; `ties` offers `ty` before `tie`, and only an indexed candidate is accepted)
- `-ied`: replace with `y`
- `-es`: remove `es`, then remove only `s`; the index determines which candidate exists (`boxes -> box`, `uses -> use`)
- `-s`: remove `s`, except tokens ending in `ss`, `us`, `is`, or invariant exceptions
- `-ed`: remove `d` first to restore silent `e`, then remove `ed`; also try one guarded consonant undoubling candidate (`loved -> love`, `stopped -> stop`)
- `-ing`: remove `ing`, then append silent `e`, then try one guarded consonant undoubling candidate (`studying -> study`, `making -> make`, `running -> run`)
- `-ier/-iest`: replace with `y`
- `-er/-est`: append silent `e` to the suffix-stripped stem, then try one guarded consonant-undoubling candidate; do not emit the raw stem (`larger/largest -> large`, while `worker` does not produce `work`)

Consonant undoubling applies only when the remaining stem ends in two identical consonants other than `w`, `x`, or `y`. A code-owned exception set blocks known invariant or commonly mis-stemmed surface forms, initially including `news`, `series`, `species`, and `status`. Tokens of three letters or fewer are not heuristically stemmed; they may still use exact or irregular lookup. Exception additions require a regression test documenting the conflicting surface form and canonical key.

The built-in irregular map initially covers high-frequency unambiguous forms such as `children -> child`, `men -> man`, `women -> woman`, `went/gone -> go`, `better/best -> good`, and `worse/worst -> bad`.

Rules only produce candidates; a candidate is accepted only when it exists in the personal index. The first release explicitly accepts that heuristic lemmatization cannot eliminate every dictionary-dependent false positive without part-of-speech context. Exact matches, minimum lengths, guarded suffix rules, and the maintained exception set limit that risk. Named-exception tests verify the known negative cases; newly observed false positives are added to the exception set with regression tests. This remains intentionally less ambitious than a full linguistic lemmatizer.

## Response and saving behavior

The returned `DictionaryEntry.word` remains the canonical lemma. The three current consumers are `reading-workbench.tsx`, `desktop-video-detail-shell.tsx`, and `reader-stage.tsx`; their save paths must continue to persist `entry.word`, so looking up `duties` saves `duty` and avoids duplicate records. The word card may continue to display the canonical entry; showing a separate “queried form -> lemma” label is outside this minimal change.

## Failure behavior

Invalid input remains a 400 response. A syntactically valid word that cannot be resolved remains a 404 with the existing Chinese message. No network dictionary fallback is introduced.

## Tests

Unit tests must cover:

- every transformation branch and its candidate order through the pure candidate generator
- exact lookup wins over irregular and heuristic alternatives
- `duties` resolves to the real `duty` entry through the API route
- invariant exceptions and words of three letters or fewer are not heuristically changed, with explicit length-three and length-four boundary tests
- a named-exception fixture where a derived candidate exists is still blocked
- punctuation and capitalization still normalize correctly
- irregular lookup precedes heuristic lookup without overriding canonical keys
- at least one consumer-level save assertion persists the canonical lemma and avoids a second saved-word key

The resolver should accept an injected lookup map (or be constructed from entries) while the production wrapper retains the cached static index. This keeps unit tests isolated without mutating the imported JSON. The focused API/unit test suite is the primary verification. Because the API route is used by three desktop reading surfaces, the existing reading-workbench component test should also remain green. TypeScript and lint checks verify the shared service change.

## Non-goals

- scanning Markdown prose for possible aliases
- creating one file per inflected form
- full linguistic parsing or part-of-speech disambiguation
- changing the reading surface's right-click interaction
