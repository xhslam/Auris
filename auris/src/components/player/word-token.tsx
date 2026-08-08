import type { MouseEvent } from "react";

type WordTokenProps = {
  isActive: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  text: string;
};

export function WordToken({ isActive, onClick, text }: WordTokenProps) {
  return (
    <button
      className="reader-stage__token"
      data-active={isActive ? "true" : "false"}
      onClick={onClick}
      type="button"
    >
      {text}
    </button>
  );
}
