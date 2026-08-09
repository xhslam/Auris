import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesNiaPicker } from "@/components/notes-v2/notes-nia-picker";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { NIA_ACTION_PREFERENCES_KEY } from "@/features/nia/nia-action-preferences-store";
import { useNiaPickerStore } from "@/features/nia/nia-picker-store";

/**
 * 选择器的价值全在交互契约上：键盘导航、scope 过滤、收藏/常用的分段顺序、
 * 以及「列表条目不带 body，调用前按需取完整定义」这条 IPC 分工。所以这些用例
 * 断言的是这些契约，而不是 DOM 结构。
 *
 * `getNiaBridge()` 从 `window.aurisNia` 读桥，只要求 invoke/subscribe/unsubscribe
 * 三个函数，所以这里装一个按 command 分派的假桥即可——不需要整个 desktop bridge。
 */

type DefinitionFixture = {
  body: string;
  canonicalId: string;
  category?: string;
  description: string;
  scope: "selection" | "document" | "workflow-step";
};

const DEFINITIONS: DefinitionFixture[] = [
  {
    body: "Improve the text.\n\n{{content}}",
    canonicalId: "improve-clarity",
    category: "editing",
    description: "Improve clarity and flow.",
    scope: "selection",
  },
  {
    body: "Summarize this.\n\n{{content}}",
    canonicalId: "summarize",
    category: "summarizing",
    description: "Summarize into a digest.",
    scope: "document",
  },
  {
    body: "Translate this.\n\n{{content}}",
    canonicalId: "translate",
    category: "editing",
    description: "Translate to English.",
    scope: "selection",
  },
  {
    // workflow-step 作用域：不该出现在选择器里。
    body: "Internal step.",
    canonicalId: "internal-step",
    description: "Workflow-only step.",
    scope: "workflow-step",
  },
];

function installBridge(
  overrides: {
    getDefinition?: (canonicalId: string) => unknown;
    listDefinitions?: () => unknown;
  } = {},
) {
  const listDefinitions = vi.fn(
    overrides.listDefinitions ??
      (() => ({
        // 主进程的列表投影会剥掉 body——fixture 如实照做，这样「调用前必须再取
        // 一次完整定义」才是被真正验证的行为。
        definitions: DEFINITIONS.map((definition) => ({
          canonicalId: definition.canonicalId,
          category: definition.category,
          description: definition.description,
          label: "Nia" as const,
          provenance: "built-in" as const,
          scope: definition.scope,
          sourceCompatibility: "canonical_v1",
        })),
      })),
  );
  const getDefinition = vi.fn(
    overrides.getDefinition ??
      ((canonicalId: string) => {
        const found = DEFINITIONS.find((entry) => entry.canonicalId === canonicalId);
        return found
          ? {
              ...found,
              label: "Nia" as const,
              provenance: "built-in" as const,
              sourceCompatibility: "canonical_v1",
            }
          : null;
      }),
  );

  const invoke = vi.fn(async (command: string, payload: Record<string, unknown> = {}) => {
    if (command === "listDefinitions") return listDefinitions();
    if (command === "getDefinition") return getDefinition(String(payload.canonicalId));
    throw new Error(`unexpected command: ${command}`);
  });

  (window as unknown as { aurisNia: unknown }).aurisNia = {
    invoke,
    subscribe: vi.fn(() => true),
    unsubscribe: vi.fn(() => true),
  };

  return { getDefinition, invoke, listDefinitions };
}

function optionNames() {
  return screen
    .getAllByRole("option")
    .map((option) => option.querySelector(".notes-v2__nia-picker-item-name")?.textContent);
}

function activeOptionName() {
  const active = screen
    .getAllByRole("option")
    .find((option) => option.getAttribute("aria-selected") === "true");
  return active?.querySelector(".notes-v2__nia-picker-item-name")?.textContent ?? null;
}

describe("NotesNiaPicker", () => {
  beforeEach(() => {
    useNiaPickerStore.getState().openPicker();
  });

  afterEach(() => {
    useNiaPickerStore.getState().closePicker();
    delete (window as unknown as { aurisNia?: unknown }).aurisNia;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders nothing while closed", () => {
    installBridge();
    useNiaPickerStore.getState().closePicker();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists invocable actions and hides workflow-only steps", async () => {
    installBridge();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));

    expect(optionNames()).toEqual(["Improve Clarity", "Translate", "Summarize"]);
    // workflow-step 作用域的定义在选择器里点下去必然无事发生，所以不该出现。
    expect(screen.queryByText("Internal Step")).not.toBeInTheDocument();
  });

  it("narrows to selection scope only when there really is a selection", async () => {
    installBridge();

    render(<NotesNiaPicker content="chosen words" hasSelection onSubmit={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));

    // 默认收窄到 selection：document 作用域的 Summarize 不在列表里。
    expect(optionNames()).toEqual(["Improve Clarity", "Translate"]);
  });

  it("moves the highlight with the arrow keys and wraps at both ends", async () => {
    const user = userEvent.setup();
    installBridge();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    const input = screen.getByRole("combobox");
    expect(activeOptionName()).toBe("Improve Clarity");

    await user.type(input, "{ArrowDown}");
    expect(activeOptionName()).toBe("Translate");

    // 从末项再往下回到首项。
    await user.type(input, "{ArrowDown}{ArrowDown}");
    expect(activeOptionName()).toBe("Improve Clarity");

    // 从首项往上到末项。
    await user.type(input, "{ArrowUp}");
    expect(activeOptionName()).toBe("Summarize");

    await user.type(input, "{Home}");
    expect(activeOptionName()).toBe("Improve Clarity");

    await user.type(input, "{End}");
    expect(activeOptionName()).toBe("Summarize");
  });

  it("fetches the full definition before invoking, since the list carries no body", async () => {
    const user = userEvent.setup();
    const bridge = installBridge();
    const onSubmit = vi.fn();

    render(<NotesNiaPicker content="rough draft" hasSelection onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(2));

    await user.click(screen.getByText("Improve Clarity"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(bridge.getDefinition).toHaveBeenCalledWith("improve-clarity");

    const submission = onSubmit.mock.calls[0][0] as { prompt: string };
    // body 的 {{content}} 被替换成真实内容——这正是主进程侧曾经丢掉的那一步。
    expect(submission.prompt).toBe("Improve the text.\n\nrough draft");
  });

  it("reports a definition that vanished between listing and invocation", async () => {
    const user = userEvent.setup();
    installBridge({ getDefinition: () => null });

    render(<NotesNiaPicker content="text" hasSelection onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(2));

    await user.click(screen.getByText("Improve Clarity"));

    await waitFor(() =>
      expect(
        screen.getByText(NOTES_UI_COPY.niaPicker.missing("Improve Clarity")),
      ).toBeInTheDocument(),
    );
  });

  it("promotes favorites above everything else and persists them", async () => {
    const user = userEvent.setup();
    installBridge();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    await user.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.niaPicker.favorite("Summarize") }),
    );

    // 收藏段落在最前，所以 Summarize 从第三位升到第一位。
    await waitFor(() => expect(optionNames()[0]).toBe("Summarize"));
    expect(screen.getByText(NOTES_UI_COPY.niaPicker.favorites)).toBeInTheDocument();

    const persisted = JSON.parse(
      window.localStorage.getItem(NIA_ACTION_PREFERENCES_KEY) ?? "{}",
    ) as { favorites?: string[] };
    expect(persisted.favorites).toEqual(["summarize"]);
  });

  it("keeps keyboard focus inside the picker after a favorite moves between groups", async () => {
    const user = userEvent.setup();
    installBridge();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    const input = screen.getByRole("combobox");
    await user.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.niaPicker.favorite("Summarize") }),
    );

    await waitFor(() => expect(optionNames()[0]).toBe("Summarize"));
    expect(input).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not invoke the action when the favorite star is clicked", async () => {
    const user = userEvent.setup();
    installBridge();
    const onSubmit = vi.fn();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    await user.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.niaPicker.favorite("Summarize") }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("records a recent after invoking and shows it in its own section", async () => {
    const user = userEvent.setup();
    installBridge();

    const { unmount } = render(
      <NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    await user.click(screen.getByText("Summarize"));
    await waitFor(() => {
      const persisted = JSON.parse(
        window.localStorage.getItem(NIA_ACTION_PREFERENCES_KEY) ?? "{}",
      ) as { recents?: string[] };
      expect(persisted.recents).toEqual(["summarize"]);
    });

    // 重新打开：常用段落出现，且被用过的动作排在最前。
    unmount();
    useNiaPickerStore.getState().openPicker();
    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(NOTES_UI_COPY.niaPicker.recents)).toBeInTheDocument(),
    );
    expect(optionNames()[0]).toBe("Summarize");
  });

  it("filters by query across name, description, and category", async () => {
    const user = userEvent.setup();
    installBridge();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    const input = screen.getByRole("combobox");

    await user.type(input, "digest");
    await waitFor(() => expect(optionNames()).toEqual(["Summarize"]));

    await user.clear(input);
    await user.type(input, "summarizing");
    await waitFor(() => expect(optionNames()).toEqual(["Summarize"]));
  });

  it("says so when nothing matches, instead of showing an empty list", async () => {
    const user = userEvent.setup();
    installBridge();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    await user.type(screen.getByRole("combobox"), "zzzznomatch");

    await waitFor(() =>
      expect(screen.getByText(NOTES_UI_COPY.niaPicker.emptyMatch)).toBeInTheDocument(),
    );
  });

  it("explains that Nia is unavailable rather than showing an empty catalog", async () => {
    // 没有桥：非桌面环境。
    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(NOTES_UI_COPY.niaPicker.unavailable)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("surfaces a listing failure instead of pretending there are no actions", async () => {
    installBridge({
      listDefinitions: () => {
        throw new Error("definitions index is corrupt");
      },
    });

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("definitions index is corrupt")).toBeInTheDocument(),
    );
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    installBridge();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    await user.type(screen.getByRole("combobox"), "{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("switching scope resets the highlight to the first visible action", async () => {
    const user = userEvent.setup();
    installBridge();

    render(<NotesNiaPicker content="text" hasSelection={false} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    await user.type(screen.getByRole("combobox"), "{ArrowDown}{ArrowDown}");
    expect(activeOptionName()).toBe("Summarize");

    await user.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.niaPicker.scopeLabels.selection }),
    );

    await waitFor(() => expect(optionNames()).toEqual(["Improve Clarity", "Translate"]));
    expect(activeOptionName()).toBe("Improve Clarity");
  });

  // ── 提交后的行为 ────────────────────────────────────────────────────────
  //
  // 这两条覆盖的是选择器最初漏掉的一整块：它调用后既不关闭也不渲染任何进行中
  // 状态，于是用户点了一下之后界面看起来毫无反应，而回复正流进被它遮住的面板。
  // 选择器拿不到那条流（session 属于 NiaPanel），所以唯一诚实的做法是让位。

  it("closes itself after submitting so the response is visible in the panel", async () => {
    const user = userEvent.setup();
    installBridge();
    const onSubmit = vi.fn();

    render(<NotesNiaPicker content="rough draft" hasSelection onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));

    await user.click(screen.getByText("Improve Clarity"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits a freeform prompt when nothing matches, as the placeholder promises", async () => {
    const user = userEvent.setup();
    const bridge = installBridge();
    const onSubmit = vi.fn();

    render(<NotesNiaPicker content="the selected text" hasSelection onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));

    // 一个匹配不到任何动作的查询，然后 Enter。
    await user.type(screen.getByRole("combobox"), "make it rhyme{Enter}");

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submission = onSubmit.mock.calls[0][0] as { action: unknown; prompt: string };
    // 自由输入没有对应定义，所以 action 为 null——宿主据此知道不能套用
    // replace/insert 这类由定义声明的落盘方式。
    expect(submission.action).toBeNull();
    // 用户的指令与当前内容都必须在提示词里：只发指令等于让模型改一段它看不到的
    // 文字。
    expect(submission.prompt).toContain("make it rhyme");
    expect(submission.prompt).toContain("the selected text");
    // 自由输入不该去取任何定义。
    expect(bridge.getDefinition).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
