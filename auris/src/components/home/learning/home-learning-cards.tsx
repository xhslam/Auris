"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRightIcon, FolderIcon, PlusIcon } from "@/components/auris-ui/auris-icons";
import type { VaultEntry } from "@/features/notes/vault/vault-types";
import {
  type HomeLearningNoteSummary,
  type HomeReadingSummary,
  type HomeReviewSummary,
  type HomeVideoSummary,
} from "@/features/home-learning/home-learning.types";
import {
  readLearningNoteFolders,
  writeLearningNoteFolders,
} from "@/features/home-learning/learning-note-folders-store";
import { getVaultClient } from "@/platform/notes/get-vault-client";

function formatTimestamp(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatClock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={value}
      className="home-learning-progress"
      role="progressbar"
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

export function HomeReviewCard({
  summary,
  onNavigate,
}: {
  summary: HomeReviewSummary;
  onNavigate: (href: string) => void;
}) {
  const addKnowledgePoint = () => onNavigate("/review?intent=create-knowledge-point");
  if (summary.status === "loading") {
    return <div className="home-learning-card" role="status">正在读取复习状态…</div>;
  }
  if (summary.status === "unavailable") {
    return <div className="home-learning-card home-learning-card--empty"><p>暂时无法读取复习状态。</p><button onClick={() => onNavigate("/review")} type="button">打开 Review <ArrowUpRightIcon size={13} /></button></div>;
  }
  if (summary.status === "empty") {
    return <div className="home-learning-card home-learning-card--empty"><p>还没有复习内容。</p><button onClick={addKnowledgePoint} type="button"><PlusIcon size={13} /> 创建第一个知识点</button></div>;
  }

  const hasActionable = summary.actionableCount > 0;
  const completed = !hasActionable && summary.completedToday > 0;
  return (
    <div className="home-learning-card home-learning-review">
      <div className="home-learning-review__top">
        <div className="home-learning-review__metric"><strong>{summary.actionableCount}</strong><span>项待复习</span></div>
        <div className="home-learning-review__counts">
          {summary.overdueCount > 0 ? <span data-tone="overdue">逾期 {summary.overdueCount} 项</span> : null}
          <span>今天到期 {summary.dueTodayCount} 项</span>
          <span>已完成 {summary.completedToday} 项</span>
        </div>
      </div>
      {summary.progressPercent !== null ? <div className="home-learning-review__progress"><div><span>今日执行进度</span><small>{summary.progressPercent}%</small></div><ProgressBar label={`今日复习进度 ${summary.progressPercent}%`} value={summary.progressPercent} /></div> : null}
      <div className="home-learning-review__context">
        {summary.nextKnowledgePoint ? <p title={summary.nextKnowledgePoint.title}>{summary.nextKnowledgePoint.urgency === "overdue" ? `逾期 ${summary.nextKnowledgePoint.overdueDays} 天 · ` : "今日到期 · "}{summary.nextKnowledgePoint.title}</p> : completed ? <p data-tone="complete">今日复习已完成。</p> : <p>今天没有待复习的知识点。</p>}
      </div>
      <div className="home-learning-card__actions">
        <button onClick={() => onNavigate("/review")} type="button">{hasActionable ? "继续复习" : "打开 Review"} <ArrowUpRightIcon size={13} /></button>
        {summary.createdToday === 0 ? <button className="home-learning-card__text-action" onClick={addKnowledgePoint} type="button">今天还没有添加新知识点 · 去添加</button> : null}
      </div>
    </div>
  );
}

export function HomeReadingCard({
  summary,
  onNavigate,
}: {
  summary: HomeReadingSummary;
  onNavigate: (href: string) => void;
}) {
  const openLibrary = () => onNavigate("/reading");
  if (summary.status === "loading") return <div className="home-learning-card" role="status">正在读取最近阅读…</div>;
  if (summary.status === "unavailable") return <div className="home-learning-card home-learning-card--empty"><p>暂时无法读取最近阅读。</p><button onClick={openLibrary} type="button">浏览 Reading <ArrowUpRightIcon size={13} /></button></div>;
  if (summary.status === "empty" || !summary.sourceId || !summary.title) return <div className="home-learning-card home-learning-card--empty"><p>还没有开始阅读。</p><button onClick={openLibrary} type="button">浏览 Reading <ArrowUpRightIcon size={13} /></button></div>;

  const progress = summary.progressPercent ?? 0;
  return (
    <div className="home-learning-card home-learning-reading">
      <div className="home-learning-card__eyebrow"><span>{summary.format === "pdf" ? "PDF 阅读" : "Reading"}</span><time>{formatTimestamp(summary.lastOpenedAt)}</time></div>
      <strong className="home-learning-card__title" title={summary.title}>{summary.title}</strong>
      <p>{summary.positionLabel ?? (summary.format === "pdf" ? "从上次位置继续" : "从上次段落继续")}</p>
      <div className="home-learning-reading__progress"><span>{progress}%</span><ProgressBar label={`阅读完成度 ${progress}%`} value={progress} /></div>
      <div className="home-learning-card__actions"><button onClick={() => onNavigate(`/reading?sourceId=${encodeURIComponent(summary.sourceId!)}`)} type="button">{progress >= 100 ? "重新打开" : "继续阅读"} <ArrowUpRightIcon size={13} /></button></div>
    </div>
  );
}

function ContinueRow({
  actionLabel,
  children,
  disabled = false,
  label,
  onAction,
  title,
}: {
  actionLabel: string;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onAction: () => void;
  title: string;
}) {
  return <section className="home-learning-continue__row"><div><span>{label}</span><strong title={title}>{title}</strong><p>{children}</p></div><button disabled={disabled} onClick={onAction} type="button">{actionLabel}</button></section>;
}

export function HomeContinueLearningCard({
  article,
  video,
  note,
  onConfigureFolders,
  onNavigate,
}: {
  article: HomeReadingSummary;
  video: HomeVideoSummary;
  note: HomeLearningNoteSummary;
  onConfigureFolders: () => void;
  onNavigate: (href: string) => void;
}) {
  const articleReady = article.status === "ready" && article.sourceId && article.title;
  const videoReady = video.status === "ready" && video.videoId && video.title;
  const noteReady = note.status === "ready" && note.note;
  const noteTitle = noteReady ? note.note!.title || "未命名笔记" : note.status === "unavailable" ? "学习目录已不可用" : note.configuredFolders.length ? "该学习目录还没有笔记" : "选择学习目录";
  return (
    <div className="home-learning-continue">
      <ContinueRow actionLabel={articleReady ? "继续" : "浏览"} label="文章" onAction={() => onNavigate(articleReady ? `/reading?sourceId=${encodeURIComponent(article.sourceId!)}` : "/reading")} title={articleReady ? article.title! : article.status === "unavailable" ? "最近阅读暂不可用" : "还没有最近阅读"}>{articleReady ? `${article.progressPercent ?? 0}%${article.positionLabel ? ` · ${article.positionLabel}` : ""}` : "打开一篇真实文章后会显示在这里"}</ContinueRow>
      <ContinueRow actionLabel={videoReady ? (video.completed ? "重播" : "继续") : "浏览"} label="视频" onAction={() => onNavigate(videoReady ? `/video/${encodeURIComponent(video.videoId!)}` : "/video")} title={videoReady ? video.title! : video.status === "unavailable" ? "最近视频暂不可用" : "还没有最近视频"}>{videoReady ? (video.completed ? "已看完 · 从头重新播放" : `${formatClock(video.currentTimeSeconds)} / ${formatClock(video.durationSeconds)}`) : "打开可播放视频后会显示在这里"}</ContinueRow>
      <ContinueRow actionLabel={noteReady ? "打开" : "选择"} label="学习笔记" onAction={() => noteReady ? onNavigate(`/notes?resumeNoteId=${encodeURIComponent(note.note!.id)}`) : onConfigureFolders()} title={noteTitle}>{noteReady ? `${note.note!.relativePath} · ${formatTimestamp(note.note!.updatedAt)}` : note.status === "unavailable" ? "请重新选择仍存在的学习目录" : "仅从你选择的目录中显示最近笔记"}</ContinueRow>
      {note.missingFolders.length > 0 ? <button className="home-learning-continue__warning" onClick={onConfigureFolders} type="button">有 {note.missingFolders.length} 个学习目录需要重新选择</button> : null}
    </div>
  );
}

export function LearningNoteFoldersDialog({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const [directories, setDirectories] = useState<VaultEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSelected(readLearningNoteFolders()?.relativePaths ?? []);
    setStatus("loading");
    const client = getVaultClient();
    if (!client) {
      setStatus("unavailable");
      return;
    }
    void client.listEntries().then((entries) => {
      if (cancelled) return;
      setDirectories(entries.filter((entry) => entry.kind === "directory"));
      setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("unavailable"); });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;
  const toggle = (path: string) => setSelected((current) => current.includes(path) ? current.filter((item) => item !== path) : [...current, path]);
  return <div aria-modal="true" className="home-learning-folders-dialog" role="dialog"><section><header><div><strong>选择学习目录</strong><p>只从这些 Vault 目录恢复最近更新的学习笔记。</p></div><button aria-label="关闭" onClick={onClose} type="button">×</button></header>{status === "loading" ? <p className="home-learning-folders-dialog__status">正在读取 Vault 目录…</p> : status === "unavailable" ? <p className="home-learning-folders-dialog__status">暂时无法读取 Notes Vault。请先配置或恢复本地笔记库。</p> : <div className="home-learning-folders-dialog__list">{directories.length ? directories.map((entry) => <label key={entry.path}><input checked={selected.includes(entry.path)} onChange={() => toggle(entry.path)} type="checkbox" /> <FolderIcon size={14} /> <span>{entry.path}</span></label>) : <p>当前 Vault 中还没有可选择的目录。</p>}</div>}<footer><button onClick={onClose} type="button">取消</button><button className="primary" disabled={status !== "ready"} onClick={() => { if (writeLearningNoteFolders(selected)) onClose(); }} type="button">保存目录</button></footer></section></div>;
}
