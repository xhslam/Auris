import type { ReactNode } from "react";

type SharedAuthBackgroundFrameProps = {
  children: ReactNode;
};

export function SharedAuthBackgroundFrame({
  children,
}: SharedAuthBackgroundFrameProps) {
  return (
    <div
      className="shared-auth-background-frame"
      data-testid="shared-auth-background-frame"
    >
      <div
        aria-hidden="true"
        className="shared-auth-background-frame__book-silhouette"
        data-testid="shared-auth-book-silhouette"
      />
      <div className="shared-auth-background-frame__content">{children}</div>
    </div>
  );
}
