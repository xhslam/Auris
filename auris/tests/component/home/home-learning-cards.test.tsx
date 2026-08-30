import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HomeContinueLearningCard } from "@/components/home/learning/home-learning-cards";
import {
  EMPTY_HOME_READING_SUMMARY,
  EMPTY_HOME_VIDEO_SUMMARY,
} from "@/features/home-learning/home-learning.types";

describe("HomeContinueLearningCard", () => {
  it("opens the scanned note by Vault-relative path", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(
      <HomeContinueLearningCard
        article={EMPTY_HOME_READING_SUMMARY}
        note={{
          status: "ready",
          note: {
            fileName: "线性方程组.md",
            icon: "文",
            id: "note-linear-equations",
            relativePath: "数学/线性方程组.md",
            title: "线性方程组",
            updatedAt: "2026-08-23T03:40:26.000Z",
          },
        }}
        onNavigate={onNavigate}
        video={EMPTY_HOME_VIDEO_SUMMARY}
      />,
    );

    expect(screen.getByText("线性方程组")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "打开" }));
    expect(onNavigate).toHaveBeenCalledWith(
      "/notes?resumeNoteId=%E6%95%B0%E5%AD%A6%2F%E7%BA%BF%E6%80%A7%E6%96%B9%E7%A8%8B%E7%BB%84.md",
    );
  });
});
