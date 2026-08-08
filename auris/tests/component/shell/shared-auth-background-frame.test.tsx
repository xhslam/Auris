import { render, screen } from "@testing-library/react";
import { SharedAuthBackgroundFrame } from "@/components/shell/shared-auth-background-frame";

describe("SharedAuthBackgroundFrame", () => {
  it("renders the shared auth background and any child content", () => {
    render(
      <SharedAuthBackgroundFrame>
        <div>frame child</div>
      </SharedAuthBackgroundFrame>,
    );

    expect(screen.getByTestId("shared-auth-background-frame")).toBeInTheDocument();
    expect(screen.getByTestId("shared-auth-book-silhouette")).toBeInTheDocument();
    expect(screen.getByText("frame child")).toBeInTheDocument();
  });
});
