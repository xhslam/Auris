import { act, render } from "@testing-library/react";
import { CompanionRuntime } from "@/components/nia/companion/companion-runtime";
import {
  NIA_COMPANION_SCALE_STORAGE_KEY,
  saveNiaCompanionScale,
} from "@/features/nia/nia-companion-scale";

describe("CompanionRuntime scale", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("scales only the companion figure and follows persisted changes", () => {
    saveNiaCompanionScale(70);
    const { container } = render(<CompanionRuntime />);
    const root = container.querySelector(".nia-companion") as HTMLElement;
    const figure = container.querySelector(".nia-companion__figure") as HTMLElement;

    expect(figure.style.getPropertyValue("--nia-companion-scale")).toBe("0.7");
    expect(root.style.getPropertyValue("--nia-companion-scale")).toBe("");

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: NIA_COMPANION_SCALE_STORAGE_KEY,
        newValue: "115",
      }));
    });

    expect(figure.style.getPropertyValue("--nia-companion-scale")).toBe("1.15");
    expect(root.style.getPropertyValue("--nia-companion-scale")).toBe("");
  });
});
