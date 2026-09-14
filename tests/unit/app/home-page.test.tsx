import HomePage from "@/app/page";
import { DesktopHomeShell } from "@/components/desktop/desktop-home-shell";

describe("HomePage", () => {
  it("renders the unified desktop home shell", () => {
    const result = HomePage();

    expect(result.type).toBe(DesktopHomeShell);
  });
});
