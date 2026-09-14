"use client";

import type { FormEvent, Ref } from "react";
import { SearchIcon } from "@/components/auris-ui/auris-icons";

type BrowserOmniboxProps = {
  value: string;
  onChange(value: string): void;
  onSubmit(value: string): void;
  inputRef?: Ref<HTMLInputElement>;
};

export function BrowserOmnibox({ value, onChange, onSubmit, inputRef }: BrowserOmniboxProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value);
  }

  return (
    <form className="browser-omnibox" role="search" onSubmit={handleSubmit}>
      <SearchIcon aria-hidden="true" size={16} />
      <input
        aria-label="地址或搜索"
        autoCapitalize="off"
        autoComplete="off"
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="搜索或输入网址"
        ref={inputRef}
        spellCheck={false}
        value={value}
      />
    </form>
  );
}
