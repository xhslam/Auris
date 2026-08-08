"use client";

import type { FormEvent } from "react";
import { SearchIcon } from "@/components/auris-ui/auris-icons";

type BrowserOmniboxProps = {
  value: string;
  onChange(value: string): void;
  onSubmit(value: string): void;
};

export function BrowserOmnibox({ value, onChange, onSubmit }: BrowserOmniboxProps) {
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
        placeholder="输入网址或搜索内容"
        spellCheck={false}
        value={value}
      />
    </form>
  );
}
