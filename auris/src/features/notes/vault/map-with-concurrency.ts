// Run an async mapper over a list with a bounded number of in-flight tasks.
//
// Reading an entire vault with a single `Promise.all(files.map(read))` opens one
// file descriptor per file at the same instant. On large vaults (thousands of
// notes) that exceeds the OS descriptor limit and throws
// "EMFILE: too many open files". A small worker pool keeps the descriptor count
// bounded while still loading in parallel.
export async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  limit: number,
  mapItem: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapItem(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return results;
}

// Default cap for vault file reads — comfortably under typical descriptor
// limits while keeping load times fast.
export const VAULT_READ_CONCURRENCY = 16;
