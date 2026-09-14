# Personal Vocabulary Markdown Rendering Design

## Goal

Render every current and future personal-vocabulary line that is displayed by an Auris word-card surface as safe, semantic Markdown, without changing the 3892 source entries or the existing section-navigation contract.

## Evidence

The current index contains 5431 italic lines, 1456 bold lines, 1440 unordered-list lines, 240 blockquotes, and two dollar-amount lines. The UI currently inserts each string as plain React text, exposing markers such as `- **词源/构词**`.

## Architecture

Create a dictionary-specific unified/remark pipeline and a shared React component. The pipeline parses CommonMark plus GFM, converts it to HTML, sanitizes it with `rehype-sanitize`, and stringifies it. Raw HTML is not enabled.

The shared component receives source-section groups rather than one flattened string. Each source section is rendered independently, preventing two matched source sections from becoming one accidental list. A stateful grouping function converts `lines[]` into Markdown blocks. Contiguous unordered-list, ordered-list, or blockquote lines are joined with single newlines. A line opening a backtick or tilde fence starts a fenced block that preserves every following line with single newlines through the matching closing fence. A pipe row followed by a valid GFM delimiter row starts a table block and preserves subsequent contiguous pipe rows. Every other source line becomes its own block, separated by a blank line. Transitions close the current block before starting the next. Tests pin list-plus-prose, quote-plus-prose, fenced code, GFM tables, multiple matched source sections, unclosed fences, and ordinary multi-line behavior.

Both `SegmentedWordCard` and `WordDefinitionPopover` use the shared component. Context sentences remain blockquotes controlled by the card. The current title matchers and navigation remain unchanged; source `当前语境` content and unknown future section titles remain outside the displayed personal-section contract unless navigation is separately expanded. Every matched section line for every word uses the renderer.

## Supported content

- paragraphs and soft line structure
- strong and emphasis
- unordered and ordered lists
- blockquotes
- inline code and fenced code
- GFM links, autolinks, tables, task lists, and strikethrough
- headings and horizontal rules

The vocabulary pipeline intentionally excludes `remark-math`: the existing corpus uses `$10` and `$50` as currency, and no vocabulary entry contains genuine math markup.

## Security

Only sanitized HTML produced by the frozen pipeline reaches `dangerouslySetInnerHTML`. The order is `remarkParse -> remarkGfm -> remarkRehype` with `allowDangerousHtml` disabled, then `rehypeSanitize(schema) -> rehypeStringify`. The frozen schema allows only `p`, `strong`, `em`, `ul`, `ol`, `li`, `blockquote`, `code`, `pre`, `del`, `a`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `h1`–`h6`, `hr`, `br`, and task-list `input` elements. Allowed attributes are `href`, `title`, table alignment, and disabled/checked/type on task inputs. Links allow only `http`, `https`, and `mailto`; relative URLs may remain relative. No `class`, `style`, `id`, `data-*`, event attribute, image, iframe, SVG, form control other than disabled task inputs, or raw HTML is allowed. The renderer exposes no option to bypass sanitization.

## Styling

Add a dedicated word-card Markdown stylesheet scoped under a shared class. It styles semantic paragraphs, lists, blockquotes, emphasis, code, links, tables, and headings consistently in both dark card variants without affecting Notes Markdown or the reading document.

## Verification

Unit tests cover real corpus shapes: `inform` bold list items, `fundamental` italics, `economic` blockquotes, and `range` dollar amounts. Security tests cover scripts, event attributes, unsafe protocols, relative links, and disabled task inputs. Component tests verify both word-card surfaces render semantic elements and no raw Markdown markers. A corpus-wide pure-render contract test processes every matched/displayable section group with an explicit timeout, asserts no exception, parses every result, and rejects `script`, `style`, `img`, `iframe`, `svg`, enabled inputs, inline event attributes, `style`/`class`/`id`/`data-*`, and link protocols outside the allowlist.

## Non-goals

- rewriting or normalizing `word-index.json`
- changing section matching/navigation
- supporting executable HTML
- interpreting currency as mathematics
