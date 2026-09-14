"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";

import {
  FolderIcon,
  PlusIcon,
  ZapIcon,
} from "@/components/auris-ui/auris-icons";
import { BrowserStatusCenter } from "@/components/desktop/browser-status-center";
import { CalendarHeatmap } from "@/components/home/calendar-heatmap";
import { DailyQuote } from "@/components/home/daily-quote";
import { LifeRoad } from "@/components/home/life-road";
import { PlanList } from "@/components/home/plan-list";
import { NotesFileTree } from "@/components/notes-v2/notes-file-tree";
import { useNotesDialog } from "@/components/notes-v2/use-notes-dialog";
import { useNotesWorkbench } from "@/components/notes-v2/use-notes-workbench";
import {
  createDefaultHomeData,
  getBrowserHomeStorage,
  readHomeData,
  toLocalDateKey,
  writeHomeData,
  type HomeData,
} from "@/features/home/home-store";
import type { NotePageSummary } from "@/features/notes/note-types";
import { useHydratedDesktopBridge } from "@/platform/desktop/use-hydrated-desktop-bridge";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";
import { getVaultClient } from "@/platform/notes/get-vault-client";
import "@/components/auris-ui/auris-ui.css";
import "./home-v3.css";

const TASK_LOG_PATH = "任务记录.md";

function formatPlanSection(plans: HomeData["plans"]) {
  if (plans.length === 0) {
    return "_今天没有计划。_";
  }

  return plans
    .map((plan) => `- [${plan.done ? "x" : " "}] ${plan.title.trim() || "未命名计划"}`)
    .join("\n");
}

// 同一天多次点"记录"时，更新当天的记录段落而不是无限堆叠重复的日期标题。
function upsertDailySection(existing: string, dateHeading: string, sectionBody: string) {
  const heading = `## ${dateHeading}`;
  const block = `${heading}\n\n${sectionBody}\n`;
  const headingIndex = existing.indexOf(heading);

  if (headingIndex === -1) {
    const trimmed = existing.trim();
    return trimmed.length > 0 ? `${trimmed}\n\n${block}` : `# 任务记录\n\n${block}`;
  }

  const nextHeadingIndex = existing.indexOf("\n## ", headingIndex + heading.length);
  const before = existing.slice(0, headingIndex);
  const after = nextHeadingIndex === -1 ? "" : existing.slice(nextHeadingIndex + 1);

  return `${before}${block}${after}`.trim().concat("\n");
}

type HomePageProps = {
  onNavigate: (href: string) => void;
  recentNotes?: NotePageSummary[];
};

function formatShortDate(now: Date) {
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${weekday} · ${month}/${day}`;
}

function createPlanId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const storage = useMemo(() => getBrowserHomeStorage(), []);
  // 首屏（SSR + 客户端首次渲染）一律用确定性默认值，避免读 localStorage 导致
  // 服务端（无 storage→空数据）和客户端（有 storage→真实数据）渲染出的 DOM 不一致
  // （会触发 hydration mismatch，例如人生路节点的 data-filled）。真实数据在挂载后再灌入。
  const [homeData, setHomeData] = useState<HomeData>(() => createDefaultHomeData());
  const now = useMemo(() => new Date(), []);
  const todayKey = toLocalDateKey(now);
  const { desktopBridge } = useHydratedDesktopBridge();

  // 复用笔记工作区：共享同一个 vault，文件操作（增删改名/移动）直接落到磁盘。
  const { promptFn, confirmFn, renderDialogs } = useNotesDialog();
  const workbench = useNotesWorkbench({ promptFn, confirmFn });

  // 桌面端在首次客户端渲染时，vault 配置状态（来自 Electron 桥接）已经
  // 和 SSR 阶段（window 不存在）不一致，直接用会触发 hydration mismatch。
  // 用 mounted 门控，让首次渲染先和服务端一致，挂载后再切到真实状态。
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 挂载后把 localStorage 里的真实数据灌进来（首屏用的是默认值）。
    setHomeData(readHomeData(storage));
    setMounted(true);
  }, [storage]);

  const isVaultConfigured = mounted && (workbench.directoryInfo?.isConfigured ?? false);

  // 把工作区错误用非阻塞的 toast 提示出来。
  useEffect(() => {
    if (workbench.errorMessage) {
      toast.error(workbench.errorMessage, { duration: 5000 });
    }
  }, [workbench.errorMessage]);

  // 点击文件 → 跳到笔记页打开它（首页本身不内嵌编辑器）。
  const openNoteFromTree = useCallback(
    (path: string) => {
      onNavigate(`/notes?resumeNoteId=${encodeURIComponent(path)}`);
    },
    [onNavigate],
  );

  // 快速笔记：新建一条笔记并跳转到笔记页打开。
  const handleQuickNote = useCallback(async () => {
    const notesStorage = getNotesStorage();

    if (!notesStorage) {
      onNavigate("/notes");
      return;
    }

    try {
      const page = await notesStorage.createPage({ title: "未命名笔记" });
      await notesStorage.savePage(page);
      onNavigate(`/notes?resumeNoteId=${encodeURIComponent(page.id)}`);
    } catch {
      onNavigate("/notes");
    }
  }, [onNavigate]);

  // 快速闪念：跳到闪念页，落地即可书写新闪念。
  const handleQuickFlash = useCallback(() => {
    onNavigate("/flash");
  }, [onNavigate]);

  const persist = useCallback(
    (updater: (current: HomeData) => HomeData) => {
      setHomeData((current) => {
        const next = updater(current);

        try {
          writeHomeData(storage, next);
        } catch {
          // Home edits should remain usable even if the browser storage quota fails.
        }

        return next;
      });
    },
    [storage],
  );

  const updateQuote = useCallback(
    (text: string) => {
      const updatedAt = new Date().toISOString();

      persist((current) => ({
        ...current,
        quote: {
          date: todayKey,
          text,
          updatedAt,
        },
      }));
    },
    [persist, todayKey],
  );

  const addPlan = useCallback(() => {
    const id = createPlanId();
    const isoNow = new Date().toISOString();

    persist((current) => ({
      ...current,
      plans: [
        ...current.plans,
        {
          id,
          title: "",
          done: false,
          createdAt: isoNow,
          updatedAt: isoNow,
        },
      ],
    }));

    return id;
  }, [persist]);

  const updatePlanTitle = useCallback(
    (id: string, title: string) => {
      const updatedAt = new Date().toISOString();

      persist((current) => ({
        ...current,
        plans: current.plans.map((plan) =>
          plan.id === id
            ? {
                ...plan,
                title,
                updatedAt,
              }
            : plan,
        ),
      }));
    },
    [persist],
  );

  const togglePlan = useCallback(
    (id: string) => {
      const updatedAt = new Date().toISOString();

      persist((current) => ({
        ...current,
        plans: current.plans.map((plan) =>
          plan.id === id
            ? {
                ...plan,
                done: !plan.done,
                updatedAt,
              }
            : plan,
        ),
      }));
    },
    [persist],
  );

  const deletePlan = useCallback(
    (id: string) => {
      persist((current) => ({
        ...current,
        plans: current.plans.filter((plan) => plan.id !== id),
      }));
    },
    [persist],
  );

  // 记录：把今天的任务列表（标题+完成情况）追加/更新进同一个 任务记录.md 里，按日期分段持续累积。
  const recordPlansToLog = useCallback(async () => {
    const client = getVaultClient();

    if (!client) {
      toast.error("未找到笔记仓库，请先在笔记里选择一个本地文件夹。");
      return;
    }

    try {
      const existing = (await client.readFile(TASK_LOG_PATH)) ?? "";
      const next = upsertDailySection(existing, todayKey, formatPlanSection(homeData.plans));

      await client.writeFile(TASK_LOG_PATH, next);
      toast.success(`已记录到 ${TASK_LOG_PATH}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "记录失败，请重试。");
    }
  }, [homeData.plans, todayKey]);

  // 导出每日计划：把今天的任务列表单独存成一份新的 markdown 文件（一次性导出，不追加）。
  const exportDailyPlan = useCallback(async () => {
    const client = getVaultClient();

    if (!client) {
      toast.error("未找到笔记仓库，请先在笔记里选择一个本地文件夹。");
      return;
    }

    const path = `每日计划归档/${todayKey} 每日计划.md`;
    const content = `# ${todayKey} 每日计划\n\n${formatPlanSection(homeData.plans)}\n`;

    try {
      await client.writeFile(path, content);
      toast.success(`已导出到 ${path}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败，请重试。");
    }
  }, [homeData.plans, todayKey]);

  const updateBirthYear = useCallback(
    (birthYear: number) => {
      persist((current) => ({
        ...current,
        birthYear,
      }));
    },
    [persist],
  );

  const updateLifeRecord = useCallback(
    (year: number, text: string) => {
      const updatedAt = new Date().toISOString();

      persist((current) => {
        const existing = current.lifeRecords.some((record) => record.year === year);
        const nextRecords = existing
          ? current.lifeRecords.map((record) =>
              record.year === year
                ? {
                    ...record,
                    text,
                    updatedAt,
                  }
                : record,
            )
          : [
              ...current.lifeRecords,
              {
                year,
                text,
                updatedAt,
              },
            ];

        return {
          ...current,
          lifeRecords: nextRecords
            .filter((record) => record.text.trim().length > 0)
            .sort((left, right) => left.year - right.year),
        };
      });
    },
    [persist],
  );

  return (
    <main className="auris-page home-v3" aria-label="Auris 首页">
      <div className="home-v3__container">
        <div className="home-v3__grid">
          <aside className="home-v3__left home-v3__rail" aria-label="我的库">
            <CalendarHeatmap />

            <section className="home-v3-card home-v3-workspace" aria-label="工作区">
              <div className="home-v3-card__head">
                <h2>
                  <FolderIcon size={17} />
                  工作区
                </h2>
                {isVaultConfigured ? (
                  <button
                    className="home-v3-workspace__switch"
                    onClick={() => void workbench.handlePickDirectory()}
                    title="切换本地文件夹"
                    type="button"
                  >
                    切换文件夹
                  </button>
                ) : null}
              </div>

              {isVaultConfigured ? (
                <div className="home-v3-workspace__tree">
                  <NotesFileTree
                    activePath={workbench.activePath}
                    collapseAllByDefault
                    entries={workbench.entries}
                    onOpenPath={openNoteFromTree}
                    onCreateNoteInPath={workbench.handleCreateNoteInPath}
                    onCreateFolderInPath={workbench.handleCreateFolderInPath}
                    onDeletePath={workbench.handleDeletePath}
                    onRenamePath={workbench.handleRenamePath}
                    onMovePath={workbench.handleMovePath}
                  />
                </div>
              ) : (
                <div className="home-v3-workspace__empty">
                  <p>选择电脑上的一个文件夹，作为你的工作区。</p>
                  <button
                    className="home-v3-workspace__pick"
                    onClick={() => void workbench.handlePickDirectory()}
                    type="button"
                  >
                    <FolderIcon size={15} />
                    选择文件夹
                  </button>
                </div>
              )}
              <div className="home-v3-quickbar" aria-label="快速创建">
                <button
                  className="home-v3-quickbar__pill"
                  onClick={() => void handleQuickNote()}
                  type="button"
                >
                  <PlusIcon size={15} />
                  快速笔记
                </button>
                <button
                  className="home-v3-quickbar__pill"
                  onClick={handleQuickFlash}
                  type="button"
                >
                  <ZapIcon size={15} />
                  快速闪念
                </button>
              </div>
            </section>
          </aside>

          <section className="home-v3__center" aria-label="人生阶段与每日格言">
            <DailyQuote dateLabel={formatShortDate(now)} onChange={updateQuote} quote={homeData.quote} />
            <LifeRoad
              birthYear={homeData.birthYear}
              records={homeData.lifeRecords}
              onUpdateBirthYear={updateBirthYear}
              onUpdateRecord={updateLifeRecord}
            />
          </section>

          <aside className="home-v3__side home-v3__rail" aria-label="今日">
            <PlanList
              items={homeData.plans}
              onAdd={addPlan}
              onDelete={deletePlan}
              onExport={exportDailyPlan}
              onRecord={recordPlansToLog}
              onToggle={togglePlan}
              onUpdateTitle={updatePlanTitle}
            />

            <div className="home-v3-browser-status">
              <BrowserStatusCenter bridge={desktopBridge?.browserStatus ?? null} />
            </div>
          </aside>
        </div>
      </div>

      {renderDialogs()}
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "#161616",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#ece8df",
            fontSize: "13px",
          },
        }}
      />
    </main>
  );
}
