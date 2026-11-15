import { act, render, screen } from "@testing-library/react";
import { NiaCharacter } from "@/components/nia/nia-character";
import { NIA_CHARACTER_STYLE_KEY, NIA_CHARACTER_STYLES, saveNiaCharacterStyle, useNiaCharacterStyle } from "@/features/nia/nia-character-appearance";

function CurrentStyle() { return <output>{useNiaCharacterStyle()}</output>; }

describe("Nia character appearance synchronization", () => {
  beforeEach(() => window.localStorage.clear());

  it("recovers from an unknown preference and follows cross-window updates and storage clearing", () => {
    window.localStorage.setItem(NIA_CHARACTER_STYLE_KEY, "unknown");
    render(<CurrentStyle />);
    expect(screen.getByRole("status")).toHaveTextContent("basic");
    act(() => {
      window.localStorage.setItem(NIA_CHARACTER_STYLE_KEY, "academic");
      window.dispatchEvent(new StorageEvent("storage", { key: NIA_CHARACTER_STYLE_KEY, newValue: "academic" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("academic");
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("basic");
  });

  it("synchronizes all mounted avatars without changing an explicit preview", () => {
    const { container } = render(<><NiaCharacter animated /><NiaCharacter /><NiaCharacter variant="basic" /></>);
    for (const style of NIA_CHARACTER_STYLES) {
      act(() => saveNiaCharacterStyle(style.id));
      const avatars = container.querySelectorAll("svg");
      expect(avatars[0]).toHaveAttribute("data-variant", style.id);
      expect(avatars[1]).toHaveAttribute("data-variant", style.id);
      expect(avatars[2]).toHaveAttribute("data-variant", "basic");
    }
  });

  it("still updates this window when storage is unavailable", () => {
    render(<CurrentStyle />);
    const failedWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    try {
      act(() => saveNiaCharacterStyle("coding"));
      expect(screen.getByRole("status")).toHaveTextContent("coding");
    } finally { failedWrite.mockRestore(); }
  });
});
