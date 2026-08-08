import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesktopHomeShell } from "@/components/desktop/desktop-home-shell";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    prefetch: vi.fn(),
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

describe("DesktopHomeShell workspace links", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pushMock.mockReset();
    Reflect.deleteProperty(window, "shadowingDesktop");
  });

  it("keeps the notes workspace linked from Home v3", async () => {
    render(<DesktopHomeShell notesStorage={null} />);

    fireEvent.click(screen.getByRole("link", { name: "本地笔记" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/notes");
    });
  });
});
