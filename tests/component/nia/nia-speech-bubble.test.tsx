import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { NiaSpeechBubble } from "@/components/nia/companion/nia-speech-bubble";

describe("NiaSpeechBubble component", () => {
  it("renders three tiers of text: said, saying, and ahead", () => {
    const { container } = render(
      <NiaSpeechBubble
        text="你好世界测试"
        cursor={2}
        visible={true}
        onDismiss={vi.fn()}
      />
    );

    const said = container.querySelector(".nia-speech-bubble__said");
    const saying = container.querySelector(".nia-speech-bubble__saying");
    const ahead = container.querySelector(".nia-speech-bubble__ahead");

    expect(said).not.toBeNull();
    expect(saying).not.toBeNull();
    expect(ahead).not.toBeNull();
    expect(said?.textContent).toBe("你好");
    expect(saying?.textContent).toBe("世");
    expect(ahead?.textContent).toBe("界测试");
  });

  it("applies aria-hidden and unsets hit-region when not visible", () => {
    const { container } = render(
      <NiaSpeechBubble
        text="你好世界"
        cursor={2}
        visible={false}
        onDismiss={vi.fn()}
      />
    );
    expect(container.querySelector("[data-nia-companion-hit-region]")).toBeNull();
  });
});
