import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrowserOmnibox } from "@/components/browser-window/browser-omnibox";
import { resolveOmniboxInput } from "@/features/browser/use-browser-window";

describe("BrowserOmnibox", () => {
  it("submits an address without moving focus away from the omnibox", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    function Harness() {
      const [value, setValue] = useState("");
      return <BrowserOmnibox value={value} onChange={setValue} onSubmit={onSubmit} />;
    }
    render(<Harness />);

    const input = screen.getByRole("textbox", { name: "地址或搜索" });
    await user.click(input);
    await user.type(input, "example.com/notes{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("example.com/notes");
    expect(input).toHaveFocus();
  });

  it("projects hostnames and search text into safe http(s) destinations", () => {
    expect(resolveOmniboxInput("example.com/notes")).toBe("https://example.com/notes");
    expect(resolveOmniboxInput("active recall 方法")).toBe(
      "https://www.google.com/search?q=active+recall+%E6%96%B9%E6%B3%95",
    );
    expect(resolveOmniboxInput("javascript:alert(1)")).toBeNull();
    expect(resolveOmniboxInput("   ")).toBeNull();
  });
});
