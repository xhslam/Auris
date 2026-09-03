export type NiaSettledRealtimeTurn = Readonly<{
  at: number;
  cut: boolean;
  itemId: string;
  responseId: string | null;
  text: string;
}>;

type HeldTurn = {
  responseId?: string;
  text?: string;
  saidAt?: number;
  interruptedAt?: number;
  finishedNaturally?: boolean;
};

const MAX_PENDING_TURNS = 1_000;

export function createNiaRealtimePendingTurns() {
  const held = new Map<string, HeldTurn>();
  const filed = new Set<string>();

  const bound = <T>(collection: Map<string, T> | Set<string>) => {
    while (collection.size > MAX_PENDING_TURNS) {
      const oldest = collection.keys().next().value;
      if (oldest === undefined) break;
      collection.delete(oldest);
    }
  };

  const record = (itemId: string, value: HeldTurn) => {
    held.set(itemId, value);
    bound(held);
  };

  const settle = (itemId: string, value: HeldTurn, text: string): NiaSettledRealtimeTurn => {
    held.delete(itemId);
    filed.add(itemId);
    bound(filed);
    const cut = value.interruptedAt !== undefined;
    return {
      at: cut ? (value.interruptedAt ?? 0) : (value.saidAt ?? 0),
      cut,
      itemId,
      responseId: value.responseId ?? null,
      text,
    };
  };

  return Object.freeze({
    began(itemId: string, responseId: string) {
      if (filed.has(itemId)) return;
      record(itemId, { ...held.get(itemId), responseId });
    },
    said(itemId: string, text: string, at: number, responseId?: string): NiaSettledRealtimeTurn | null {
      if (filed.has(itemId)) return null;
      const current = { ...held.get(itemId), ...(responseId ? { responseId } : {}), saidAt: at };
      if (current.interruptedAt !== undefined || current.finishedNaturally === true) {
        return settle(itemId, current, text);
      }
      if (current.responseId === undefined) return settle(itemId, current, text);
      record(itemId, { ...current, text });
      return null;
    },
    truncated(itemId: string, at: number): NiaSettledRealtimeTurn | null {
      if (filed.has(itemId)) return null;
      const current = { ...held.get(itemId), interruptedAt: at };
      if (current.text !== undefined) return settle(itemId, current, current.text);
      record(itemId, current);
      return null;
    },
    finished(responseId: string): NiaSettledRealtimeTurn[] {
      const settled: NiaSettledRealtimeTurn[] = [];
      for (const [itemId, current] of held) {
        if (current.responseId !== responseId || current.interruptedAt !== undefined) continue;
        if (current.text === undefined) record(itemId, { ...current, finishedNaturally: true });
        else settled.push(settle(itemId, current, current.text));
      }
      return settled;
    },
    flush(): NiaSettledRealtimeTurn[] {
      const settled: NiaSettledRealtimeTurn[] = [];
      for (const [itemId, current] of held) {
        if (current.interruptedAt !== undefined) settled.push(settle(itemId, current, current.text ?? ""));
        else if (current.text !== undefined) settled.push(settle(itemId, current, current.text));
      }
      held.clear();
      return settled;
    },
  });
}
