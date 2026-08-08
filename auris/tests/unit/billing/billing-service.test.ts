import { createBillingService } from "@/features/billing/billing-service";

describe("billing service", () => {
  it("marks web billing as unsupported", async () => {
    const service = createBillingService({
      runtime: { isNativeApp: false, platform: "web" },
    });

    await expect(service.getProducts()).resolves.toEqual([]);
    await expect(service.restorePurchases()).resolves.toEqual({
      entitlements: [],
      isSupported: false,
    });
  });

  it("exposes native billing inside mobile app containers", () => {
    const service = createBillingService({
      runtime: { isNativeApp: true, platform: "ios" },
    });

    expect(service.kind).toBe("native");
  });
});
