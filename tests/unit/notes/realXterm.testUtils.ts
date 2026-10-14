/**
 * VMark v0.9.99: src/components/Terminal/realXterm.testUtils.ts
 * Commit f2bf1b3fce06ca21fe7cd19382bef9c4774d0558.
 * ISC License
 *
 * Copyright (c) 2026 Xiaolai Li
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */
/**
 * Real-xterm probes for terminal-STATE tests.
 *
 * `src/test/setup.ts` mocks `@xterm/xterm` for the whole app tier, so a test
 * that needs to know what the terminal will actually DO — which bytes a mouse
 * move or a paste produces — imports the real module here. An unopened
 * Terminal still runs the full VT parser, which is where every mode lives.
 *
 * State is read back through the terminal's own report sequences (DECRQM for
 * modes, DECRQSS for SGR and scroll margins), i.e. the public protocol any
 * program could use — never through xterm internals.
 *
 * @module components/Terminal/realXterm.testUtils
 */

import { afterEach, vi } from "vitest";
import type { ITerminalInitOnlyOptions, ITerminalOptions, Terminal } from "@xterm/xterm";

const { Terminal: RealTerminal } =
  await vi.importActual<typeof import("@xterm/xterm")>("@xterm/xterm");

/** A real, unopened xterm with production-like options. */
export function createRealTerminal(
  options: ITerminalOptions & ITerminalInitOnlyOptions = {},
): Terminal {
  const term = new RealTerminal({ cols: 80, rows: 24, allowProposedApi: true, ...options });
  terminals.push(term);
  return term;
}

/** Resolve once xterm has parsed everything written to it so far. */
export function flushWrites(term: Terminal): Promise<void> {
  return new Promise((resolve) => term.write("", resolve));
}

/** Write `data` and resolve once it has been parsed. */
export function writeParsed(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}


const terminals: Terminal[] = [];
afterEach(() => { while (terminals.length) terminals.pop()?.dispose(); });
