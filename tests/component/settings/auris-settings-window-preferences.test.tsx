import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AurisSettings } from "@/components/settings/auris-settings";
import {
  APP_WINDOW_PREFERENCES_STORAGE_KEY,
  loadAppWindowPreferences,
} from "@/features/appearance/app-window-preferences";

describe("AurisSettings window preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists title, status bar, and focus dim controls", async () => {
    render(<AurisSettings />);

    fireEvent.click(
      screen.getByRole("switch", { name: "在标题栏显示文件名" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "自动隐藏状态栏" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "暗化程度：标准" }));
    fireEvent.click(screen.getByRole("button", { name: "暗化程度：强" }));

    await waitFor(() => {
      expect(loadAppWindowPreferences()).toEqual({
        focusDim: 2,
        hideStatus: true,
        titlebarName: true,
      });
    });
    expect(window.localStorage.getItem(APP_WINDOW_PREFERENCES_STORAGE_KEY)).not.toBeNull();
    expect(screen.getByRole("button", { name: "暗化程度：更强" })).toBeInTheDocument();
  });
});
