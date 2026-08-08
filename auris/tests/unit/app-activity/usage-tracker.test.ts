import {
  buildUsageHeatmap,
  recordActiveElapsed,
  usageToneForMilliseconds,
} from "@/features/app-activity/usage-tracker";

describe("usage tracker", () => {
  it("adds a bounded active segment to its local calendar day", () => {
    const totals = recordActiveElapsed({
      now: new Date("2026-06-20T10:00:30"),
      startedAt: new Date("2026-06-20T10:00:00"),
      totals: {},
    });

    expect(totals).toEqual({ "2026-06-20": 30_000 });
  });

  it("does not count an unexpectedly long or negative segment", () => {
    expect(
      recordActiveElapsed({
        now: new Date("2026-06-20T12:00:00"),
        startedAt: new Date("2026-06-20T10:00:00"),
        totals: { "2026-06-20": 5_000 },
      }),
    ).toEqual({ "2026-06-20": 5_000 });

    expect(
      recordActiveElapsed({
        now: new Date("2026-06-20T10:00:00"),
        startedAt: new Date("2026-06-20T10:00:30"),
        totals: {},
      }),
    ).toEqual({});
  });

  it("splits an active segment across local calendar days", () => {
    const totals = recordActiveElapsed({
      now: new Date("2026-06-21T00:00:20"),
      startedAt: new Date("2026-06-20T23:59:40"),
      totals: {},
    });

    expect(totals).toEqual({
      "2026-06-20": 20_000,
      "2026-06-21": 20_000,
    });
  });

  it("builds twelve weeks of day cells with deeper tones for longer use", () => {
    const heatmap = buildUsageHeatmap({
      now: new Date("2026-06-20T10:00:00"),
      totals: {
        "2026-06-18": 14 * 60_000,
        "2026-06-19": 46 * 60_000,
        "2026-06-20": 91 * 60_000,
      },
    });

    expect(heatmap).toHaveLength(84);
    expect(heatmap.at(-1)).toMatchObject({
      date: "2026-06-20",
      tone: "peak",
      totalMilliseconds: 91 * 60_000,
    });
    expect(usageToneForMilliseconds(0)).toBe("none");
    expect(usageToneForMilliseconds(14 * 60_000)).toBe("low");
    expect(usageToneForMilliseconds(46 * 60_000)).toBe("high");
  });
});
