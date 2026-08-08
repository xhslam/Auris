"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  formatDuration,
  formatResolution,
  getAnalysisStatusLabel,
  getImportStateLabel,
} from "@/features/video-library/video-library-formatters";
import type { DesktopVideoLibraryItem } from "@/features/video-library/video-library.types";

type DesktopVideoCardProps = {
  item: DesktopVideoLibraryItem;
};

export function DesktopVideoCard({ item }: DesktopVideoCardProps) {
  return (
    <article className="desktop-video-card">
      <Link
        aria-label={`${item.title} · 打开播放器`}
        className="desktop-video-card__link"
        href={`/video/${item.id}`}
      >
        <div className="desktop-video-card__poster">
          {item.posterUrl ? (
            <img
              alt=""
              className="desktop-video-card__poster-image"
              src={item.posterUrl}
            />
          ) : (
            <div className="desktop-video-card__poster-placeholder" aria-hidden="true">
              <span>{item.variantCount} 个画质位</span>
              <strong>{item.extension.replace(".", "").toUpperCase()}</strong>
            </div>
          )}
          <div className="desktop-video-card__badge-strip">
            <span>{formatDuration(item.durationMs)}</span>
            <span>{formatResolution(item.width, item.height)}</span>
          </div>
        </div>

        <div className="desktop-video-card__copy">
          <strong>{item.title}</strong>
          <p>{item.sourceFileName}</p>
        </div>

        <div className="desktop-video-card__meta">
          <span>{getImportStateLabel(item.importState)}</span>
          <span>{getAnalysisStatusLabel(item.analysisStatus)}</span>
        </div>
      </Link>
    </article>
  );
}
