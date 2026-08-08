"use client";

import type { DailyQuote as DailyQuoteRecord } from "@/features/home/home-store";

type DailyQuoteProps = {
  dateLabel: string;
  quote: DailyQuoteRecord;
  onChange: (text: string) => void;
};

export function DailyQuote({ dateLabel, onChange, quote }: DailyQuoteProps) {
  return (
    <section className="home-v3-quote" aria-label="每日格言">
      <div className="home-v3-quote__meta">
        <span>每日格言</span>
        {/* 日期按「客户端当前时间」渲染，服务端那份 HTML（可能是早些时候缓存的）
            必然对不上 → 用 suppressHydrationWarning 豁免这一处比对，挂载后以客户端值为准。 */}
        <time dateTime={quote.date} suppressHydrationWarning>
          {dateLabel}
        </time>
      </div>
      <textarea
        aria-label="编辑每日格言"
        className="home-v3-quote__input"
        onChange={(event) => onChange(event.currentTarget.value)}
        spellCheck={false}
        value={quote.text}
      />
    </section>
  );
}
