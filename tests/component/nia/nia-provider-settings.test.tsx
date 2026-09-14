import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NiaProviderSettings } from "@/components/nia/nia-provider-settings";

describe("Nia provider settings", () => {
  it("selects provider/model and exposes opt-in history", async () => {
    const user = userEvent.setup();
    const onProviderChange = vi.fn();
    const onModelChange = vi.fn();
    const onHistoryEnabledChange = vi.fn();
    render(
      <NiaProviderSettings
        historyEnabled={false}
        model="m1"
        onHistoryEnabledChange={onHistoryEnabledChange}
        onModelChange={onModelChange}
        onProviderChange={onProviderChange}
        providerId="p1"
        providers={[
          { id: "p1", label: "Local", kind: "rest", enabled: true, defaultModel: "m1", supportedModels: ["m1", "m2"] },
          { id: "p2", label: "CLI", kind: "cli", enabled: true, defaultModel: "default", supportedModels: ["default"] },
        ]}
      />,
    );
    await user.click(screen.getByText("模型设置"));
    await user.selectOptions(screen.getByLabelText("Nia provider"), "p2");
    await user.selectOptions(screen.getByLabelText("Nia model"), "m2");
    await user.click(screen.getByRole("checkbox", { name: "保存文字模型本地历史" }));
    expect(onProviderChange).toHaveBeenCalledWith("p2");
    expect(onModelChange).toHaveBeenCalledWith("m2");
    expect(onHistoryEnabledChange).toHaveBeenCalledWith(true);
  });

  it("saves a REST provider draft with session key and remember flag", async () => {
    const user = userEvent.setup();
    const onSaveRestProvider = vi.fn(async () => true);
    render(
      <NiaProviderSettings
        historyEnabled={false}
        model={null}
        onHistoryEnabledChange={vi.fn()}
        onModelChange={vi.fn()}
        onProviderChange={vi.fn()}
        onSaveRestProvider={onSaveRestProvider}
        providerId={null}
        providers={[]}
      />,
    );

    await user.clear(screen.getByLabelText("Nia provider label"));
    await user.type(screen.getByLabelText("Nia provider label"), "My Anthropic");
    await user.clear(screen.getByLabelText("Nia provider default model"));
    await user.type(screen.getByLabelText("Nia provider default model"), "claude-sonnet-4-5");
    await user.type(screen.getByLabelText("Nia provider API key"), "sk-test");
    await user.click(screen.getByRole("checkbox", { name: "记住在这台 Mac 上" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSaveRestProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: "anthropic",
        label: "My Anthropic",
        defaultModel: "claude-sonnet-4-5",
        endpoint: "https://api.anthropic.com",
      }),
      { apiKey: "sk-test", rememberOnThisMac: true },
    );
  });
});
