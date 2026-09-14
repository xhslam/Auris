import type { PropsWithChildren } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/providers/query-provider", () => ({
  QueryProvider({ children }: PropsWithChildren) {
    return children;
  },
}));

vi.mock("@/lib/di/service-provider", () => ({
  ServiceProvider({ children }: PropsWithChildren) {
    return children;
  },
}));

vi.mock("@/components/error-boundary/global-error-boundary", () => ({
  GlobalErrorBoundary({ children }: PropsWithChildren) {
    return children;
  },
}));

vi.mock("@/services/register-services", () => ({
  registerServices: vi.fn(),
}));

import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  it("does not reserve a top Auris title bar above the app content", () => {
    render(
      <RootLayout>
        <main data-testid="page-content">Notes</main>
      </RootLayout>,
    );

    expect(screen.queryByTestId("auris-titlebar")).not.toBeInTheDocument();
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });
});
