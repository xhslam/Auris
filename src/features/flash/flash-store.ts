import { z } from "zod";

export const FLASH_STORAGE_KEY = "auris-flash-items";

export type FlashItem = {
  createdAt: string;
  id: string;
  isFavorite: boolean;
  text: string;
};

export type FlashFilter = "all" | "favorites" | "today";

export type FlashActivityDay = {
  count: number;
  dateKey: string;
  level: 0 | 1 | 2 | 3 | 4;
};

const flashItemSchema = z.object({
  createdAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  id: z.string().min(1),
  isFavorite: z.boolean().optional().default(false),
  text: z.string().trim().min(1),
});

function toDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseFlashItems(value: string | null): FlashItem[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((candidate) => {
      const result = flashItemSchema.safeParse(candidate);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function readFlashItems(storage: Storage): FlashItem[] {
  try {
    return parseFlashItems(storage.getItem(FLASH_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeFlashItems(storage: Storage, items: FlashItem[]): boolean {
  try {
    storage.setItem(FLASH_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function buildFlashActivity(
  items: FlashItem[],
  today = new Date(),
  dayCount = 98,
): FlashActivityDay[] {
  const boundedDayCount = Math.max(1, Math.min(366, Math.floor(dayCount)));
  const countByDate = items.reduce<Record<string, number>>((counts, item) => {
    const dateKey = toDateKey(new Date(item.createdAt));
    return { ...counts, [dateKey]: (counts[dateKey] ?? 0) + 1 };
  }, {});
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return Array.from({ length: boundedDayCount }, (_, index) => {
    const date = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate() - boundedDayCount + 1 + index,
    );
    const dateKey = toDateKey(date);
    const count = countByDate[dateKey] ?? 0;

    return {
      count,
      dateKey,
      level: Math.min(4, count) as FlashActivityDay["level"],
    };
  });
}
