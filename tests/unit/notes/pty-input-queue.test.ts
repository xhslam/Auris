/**
 * VMark v0.9.99: src/lib/ptyInputQueue.test.ts
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
// Drives createPtyInputQueue directly (#1507): a rejected write must not strand
// input queued behind it, and close() must stop every later delivery — queued
// input, input written after close, and input queued while a write is in flight.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPtyInputQueue } from "@/components/notes-v2/terminal/pty-input-queue";

interface InFlight { data: string; resolve: () => void; reject: (error: Error) => void }
let inFlight: InFlight[];
let received: string[];
let writeFn: (data: string) => Promise<void>;
let onError: ReturnType<typeof vi.fn<(error: unknown) => void>>;

beforeEach(() => {
  inFlight = [];
  received = [];
  onError = vi.fn<(error: unknown) => void>();
  writeFn = (data) => {
    received.push(data);
    return new Promise<void>((resolve, reject) => inFlight.push({ data, resolve, reject }));
  };
});

const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe("createPtyInputQueue", () => {
  it("delivers a batch queued behind a rejected write without another keystroke", async () => {
    const queue = createPtyInputQueue(writeFn, onError);
    queue.write("first");
    await tick();
    queue.write("sec");
    queue.write("ond");
    expect(received).toEqual(["first"]);

    const error = new Error("PTY write failed");
    inFlight.shift()!.reject(error);
    await tick();

    expect(onError).toHaveBeenCalledWith(error);
    // The failed write is not replayed; the queued batch goes out on its own.
    expect(received).toEqual(["first", "second"]);
    inFlight.shift()!.resolve();
    await tick();
    expect(received).toEqual(["first", "second"]);
    expect(inFlight).toEqual([]);
  });

  it("delivers nothing written after close()", async () => {
    const queue = createPtyInputQueue(writeFn, onError);
    queue.close();
    queue.write("late");
    await tick();
    expect(received).toEqual([]);
  });

  it("drops input queued behind an in-flight write when closed mid-write", async () => {
    const queue = createPtyInputQueue(writeFn, onError);
    queue.write("first");
    await tick();
    queue.write("queued");
    queue.close();
    queue.write("after close");
    inFlight.shift()!.resolve();
    await tick();
    expect(received).toEqual(["first"]);
    expect(inFlight).toEqual([]);
  });

  it("drops queued input when closed mid-write and that write then fails", async () => {
    const queue = createPtyInputQueue(writeFn, onError);
    queue.write("first");
    await tick();
    queue.write("queued");
    queue.close();
    inFlight.shift()!.reject(new Error("session gone"));
    await tick();
    expect(received).toEqual(["first"]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
