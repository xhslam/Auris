"use client";

type NoteCardProps = {
  title: string;
  updatedAt?: string;
  excerpt?: string;
  tags?: string[];
  onOpen?: () => void;
};

function formatTime(value?: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Auris note card — reminds-style: time / title / excerpt / tags.
 * Pure presentation; opening logic is delegated via onOpen.
 */
export function NoteCard({
  title,
  updatedAt,
  excerpt,
  tags,
  onOpen,
}: NoteCardProps) {
  return (
    <button
      className="auris-card auris-card--interactive"
      onClick={onOpen}
      style={{ textAlign: "left", width: "100%", cursor: "pointer" }}
      type="button"
    >
      {updatedAt ? <p className="auris-note-card__time">{formatTime(updatedAt)}</p> : null}
      <h3 className="auris-note-card__title">{title || "未命名笔记"}</h3>
      {excerpt ? <p className="auris-note-card__excerpt">{excerpt}</p> : null}
      {tags && tags.length > 0 ? (
        <div>
          {tags.slice(0, 3).map((tag) => (
            <span className="auris-tag" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}
