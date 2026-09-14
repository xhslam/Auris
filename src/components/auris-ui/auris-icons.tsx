"use client";

import type { SVGProps } from "react";

/**
 * Lucide-style line icons used by the Auris redesign surfaces.
 * Inlined (no runtime dependency) so the bundle stays lean. stroke-width 1.5,
 * 24×24 viewBox, currentColor — sized via font-size / width on the parent.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function SearchIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function BookmarkIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 4h12v16l-6-3.5L6 20V4Z" />
    </svg>
  );
}

export function BookTextIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 5.5h6A3 3 0 0 1 13 8.5V20a3 3 0 0 0-3-2.5H4V5.5Z" />
      <path d="M20 5.5h-5a2 2 0 0 0-2 2V20a3 3 0 0 1 3-2.5h4V5.5Z" />
      <path d="M7 9h3M7 12h3M16 9h1" />
    </svg>
  );
}

export function SunIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2M12 19.5v2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M2.5 12h2M19.5 12h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4" />
    </svg>
  );
}

export function FolderIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 6.5h6l2 2h8v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5Z" />
    </svg>
  );
}

export function CalendarDaysIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" />
    </svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function VideoIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4V7Z" />
      <path d="m17 10 4-2.5v9L17 14" />
    </svg>
  );
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowUpRightIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

export function ArrowUpIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

export function AlignLeftIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 6h16M4 12h10M4 18h13" />
    </svg>
  );
}

export function BookOpenIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 7v13M3 5.5h5A3 3 0 0 1 11 8.5V18a3 3 0 0 0-3-2.5H3V5.5ZM21 5.5h-5A3 3 0 0 0 13 8.5V18a3 3 0 0 1 3-2.5h5V5.5Z" />
    </svg>
  );
}

export function ListChecksIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M11 7h9M11 12h9M11 17h9M3 7l1.5 1.5L7 6M3 17l1.5 1.5L7 16" />
    </svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function ActivityIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M22 12h-4l-3 8L9 4l-3 8H2" />
    </svg>
  );
}

export function OrbitIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M20.3 7.7c1.3 1.3.2 4.5-2.5 7.2s-5.9 3.8-7.2 2.5-.2-4.5 2.5-7.2 5.9-3.8 7.2-2.5Z" />
      <path d="M3.7 16.3c-1.3-1.3-.2-4.5 2.5-7.2s5.9-3.8 7.2-2.5.2 4.5-2.5 7.2-5.9 3.8-7.2 2.5Z" />
    </svg>
  );
}

export function ZapIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M13 3 5 13.5h6L11 21l8-10.5h-6L13 3Z" />
    </svg>
  );
}

export function Trash2Icon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function NotebookPenIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 4h9a2 2 0 0 1 2 2v6M5 4v16M5 4H4m1 16h-1m1-8H4m1-4H4m12.5 4.5 3 3L14 21l-3 .5.5-3 5-4.5Z" />
    </svg>
  );
}

export function HistoryIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4M12 8v4l3 2" />
    </svg>
  );
}

export function ChevronUpIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

export function RotateCcwIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 12a9 9 0 1 0 2.6-6.3L3 8M3 4v4h4" />
    </svg>
  );
}

export function PlayIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M7 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.6A1.7 1.7 0 0 0 11 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function InfoIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
