import {
  FLASH_STORAGE_KEY,
  buildFlashActivity,
  parseFlashItems,
  readFlashItems,
  writeFlashItems,
} from "@/features/flash/flash-store";

describe("flash store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads legacy items with a default favorite state", () => {
    const items = parseFlashItems(
      JSON.stringify([
        {
          createdAt: "2026-08-06T08:00:00.000Z",
          id: "legacy-item",
          text: "旧版闪念",
        },
      ]),
    );

    expect(items).toEqual([
      {
        createdAt: "2026-08-06T08:00:00.000Z",
        id: "legacy-item",
        isFavorite: false,
        text: "旧版闪念",
      },
    ]);
  });

  it("drops malformed local data instead of exposing invalid items", () => {
    const items = parseFlashItems(
      JSON.stringify([
        null,
        { id: "missing-fields" },
        { createdAt: "invalid", id: "invalid-date", text: "bad" },
        {
          createdAt: "2026-08-06T08:00:00.000Z",
          id: "valid-item",
          isFavorite: true,
          text: "有效闪念",
        },
      ]),
    );

    expect(items).toEqual([
      expect.objectContaining({ id: "valid-item", isFavorite: true }),
    ]);
  });

  it("returns an empty list when persisted JSON is corrupt", () => {
    window.localStorage.setItem(FLASH_STORAGE_KEY, "not-json");

    expect(readFlashItems(window.localStorage)).toEqual([]);
  });

  it("rejects a valid JSON value that is not an item list", () => {
    expect(parseFlashItems(JSON.stringify({ id: "not-a-list" }))).toEqual([]);
  });

  it("returns an empty list when storage cannot be read", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    } as unknown as Storage;

    expect(readFlashItems(storage)).toEqual([]);
  });

  it("persists valid items under the shared storage key", () => {
    const items = [
      {
        createdAt: "2026-08-06T08:00:00.000Z",
        id: "flash-1",
        isFavorite: false,
        text: "测试",
      },
    ];

    expect(writeFlashItems(window.localStorage, items)).toBe(true);
    expect(window.localStorage.getItem(FLASH_STORAGE_KEY)).toContain("flash-1");
  });

  it("reports storage failures without mutating the provided items", () => {
    const items = [
      {
        createdAt: "2026-08-06T08:00:00.000Z",
        id: "flash-1",
        isFavorite: false,
        text: "测试",
      },
    ];
    const storage = {
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      }),
    } as unknown as Storage;

    expect(writeFlashItems(storage, items)).toBe(false);
    expect(items[0].isFavorite).toBe(false);
  });

  it("builds a chronological activity grid from flash dates", () => {
    const activity = buildFlashActivity(
      [
        {
          createdAt: "2026-08-06T08:00:00.000Z",
          id: "flash-1",
          isFavorite: false,
          text: "one",
        },
        {
          createdAt: "2026-08-06T10:00:00.000Z",
          id: "flash-2",
          isFavorite: false,
          text: "two",
        },
      ],
      new Date("2026-08-07T12:00:00.000Z"),
      7,
    );

    expect(activity).toHaveLength(7);
    expect(activity.at(-2)).toMatchObject({ count: 2, level: 2 });
    expect(activity.at(-1)).toMatchObject({ count: 0, level: 0 });
  });
});
