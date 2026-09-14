"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";
import {
  appendStudySession,
  createPersonalOsSnapshot,
  energyLevelLabels,
  findDailyDirectory,
  getLocalDateKey,
  joinRelativePath,
  type EnergyLevel,
  type PersonalOsProject,
  type PersonalOsSnapshot,
  type StudySessionInput,
} from "./personal-os-markdown";
import "./personal-os-dashboard.css";

type PersonalOsDashboardProps = {
  bridge: DesktopBridge | null;
  onChooseDirectory: () => Promise<unknown>;
};

type DashboardState =
  | { kind: "loading"; message: string }
  | { kind: "disconnected"; message: string }
  | { kind: "ready"; snapshot: PersonalOsSnapshot }
  | { kind: "error"; message: string };

type SessionDraft = Omit<StudySessionInput, "projectId">;

const activeProjectStorageKey = "auris.personal-os.active-project.v1";

function readActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(activeProjectStorageKey);
  } catch {
    return null;
  }
}

function writeActiveProjectId(value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(activeProjectStorageKey, value);
    else window.localStorage.removeItem(activeProjectStorageKey);
  } catch {
    // 本地偏好不可用不应阻断 Markdown 文件读写。
  }
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createEmptyDraft(projectId: string): StudySessionInput {
  return {
    blocker: "",
    content: "",
    durationMinutes: 25,
    energyLevel: 3,
    nextStep: "",
    outcome: "",
    projectId,
  };
}

function hasRequiredFiles(paths: ReadonlySet<string>) {
  return paths.has("00_总览.md") && paths.has("02_项目库.md");
}

function DashboardNotice({ state, onConnect, onRefresh }: {
  onConnect: () => void;
  onRefresh: () => void;
  state: DashboardState;
}) {
  if (state.kind === "loading") {
    return <div className="personal-os-card personal-os-card--notice"><small>个人操作系统</small><strong>正在读取你的 Markdown 工作区…</strong><p>{state.message}</p></div>;
  }
  if (state.kind === "ready") return null;
  const isError = state.kind === "error";
  return (
    <div className="personal-os-card personal-os-card--notice" data-tone={isError ? "warning" : "neutral"}>
      <small>个人操作系统</small>
      <strong>{isError ? "暂时无法读取工作区" : "连接你的 Markdown 个人操作系统"}</strong>
      <p>{state.message}</p>
      <div className="personal-os-card__actions">
        <button className="personal-os-button" onClick={onConnect} type="button">选择 Markdown 文件夹</button>
        {isError ? <button className="personal-os-button personal-os-button--quiet" onClick={onRefresh} type="button">重新读取</button> : null}
      </div>
    </div>
  );
}

function ProjectSummary({ project, isActive, onChoose, onRecord }: {
  isActive: boolean;
  onChoose: () => void;
  onRecord: () => void;
  project: PersonalOsProject;
}) {
  return (
    <article className="personal-os-card personal-os-project" data-active={isActive ? "true" : "false"}>
      <div className="personal-os-card__eyebrow"><small>{project.area || "学习/成长"}</small>{isActive ? <span>今日主项目</span> : null}</div>
      <strong>{project.title}</strong>
      <p>{project.nextStep || project.goal || "请在项目库中补充下一步行动。"}</p>
      {project.currentState[0] ? <small className="personal-os-project__state">当前：{project.currentState[0]}</small> : null}
      <div className="personal-os-card__actions">
        <button className="personal-os-button personal-os-button--quiet" onClick={onChoose} type="button">{isActive ? "已选为主项目" : "设为今日主项目"}</button>
        <button className="personal-os-button" onClick={onRecord} type="button">记录本次学习</button>
      </div>
    </article>
  );
}

const energyLevels: EnergyLevel[] = [1, 2, 3, 4, 5];

function StudySessionDialog({ onClose, onSubmit, project, submitting }: {
  onClose: () => void;
  onSubmit: (session: StudySessionInput) => Promise<void>;
  project: PersonalOsProject;
  submitting: boolean;
}) {
  const [draft, setDraft] = useState<StudySessionInput>(() => createEmptyDraft(project.id));
  const update = (key: keyof SessionDraft, value: string | number) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.content.trim() || !draft.outcome.trim() || !draft.nextStep.trim()) return;
    void onSubmit({ ...draft, projectId: project.id });
  };
  return (
    <div aria-modal="true" className="personal-os-dialog" role="dialog">
      <form className="personal-os-dialog__panel" onSubmit={submit}>
        <header><div><small>结束学习时段</small><strong>{project.title}</strong></div><button aria-label="关闭学习记录" onClick={onClose} type="button">×</button></header>
        <p>本次记录将仅追加到当天的 Markdown 日记，不会直接改写项目目标或下一步。</p>
        <label>投入时间（分钟）<input min="1" max="1440" onChange={(event) => update("durationMinutes", Number(event.target.value))} required type="number" value={draft.durationMinutes} /></label>
        <fieldset className="personal-os-energy-picker"><legend>结束时状态 <span>心情/能量</span></legend><div aria-label="选择结束时的心情与能量" role="group">{energyLevels.map((level) => <button aria-pressed={draft.energyLevel === level} className={draft.energyLevel === level ? "is-selected" : ""} key={level} onClick={() => update("energyLevel", level)} title={`${energyLevelLabels[level]}（${level}/5）`} type="button"><b>{level}</b><span>{energyLevelLabels[level]}</span></button>)}</div><p>默认“平稳”。按结束时的真实感受选择，不作好坏评价。</p></fieldset>
        <label>具体内容<textarea onChange={(event) => update("content", event.target.value)} placeholder="例如：完成线性代数第二章欧哥课程并整理例题" required value={draft.content} /></label>
        <label>可验证结果<textarea onChange={(event) => update("outcome", event.target.value)} placeholder="例如：已完成 3 节课、整理 12 道例题" required value={draft.outcome} /></label>
        <label>卡点（可留空）<textarea onChange={(event) => update("blocker", event.target.value)} placeholder="例如：特征值计算仍不熟练" value={draft.blocker} /></label>
        <label>下一步<textarea onChange={(event) => update("nextStep", event.target.value)} placeholder="例如：完成第三节并做对应练习" required value={draft.nextStep} /></label>
        <footer><button className="personal-os-button personal-os-button--quiet" disabled={submitting} onClick={onClose} type="button">取消</button><button className="personal-os-button" disabled={submitting || !draft.content.trim() || !draft.outcome.trim() || !draft.nextStep.trim()} type="submit">{submitting ? "正在追加…" : "追加到今日记录"}</button></footer>
      </form>
    </div>
  );
}

export function PersonalOsDashboard({ bridge, onChooseDirectory }: PersonalOsDashboardProps) {
  const [state, setState] = useState<DashboardState>({ kind: "loading", message: "等待桌面文件访问能力就绪。" });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => readActiveProjectId());
  const [recordProjectId, setRecordProjectId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!bridge) {
      setState({ kind: "disconnected", message: "仅桌面端可在你选定的本地文件夹内读取和写入个人操作系统。" });
      return;
    }
    setState({ kind: "loading", message: "正在读取工作区文件…" });
    try {
      const info = await bridge.vault.getDirectoryInfo();
      if (!info.vaultPath) {
        setState({ kind: "disconnected", message: "请选择包含 00_总览.md、02_项目库.md 和 daily/ 的 Markdown 文件夹。" });
        return;
      }
      const entries = await bridge.vault.listFiles();
      const paths = new Set(entries.filter((entry) => !entry.isDirectory).map((entry) => entry.relativePath));
      if (!hasRequiredFiles(paths)) {
        setState({ kind: "disconnected", message: "当前文件夹不是个人操作系统根目录。请选择直接包含 00_总览.md 与 02_项目库.md 的文件夹。" });
        return;
      }
      const dailyDirectory = findDailyDirectory([...paths]);
      const date = getLocalDateKey();
      const dailyPath = joinRelativePath(dailyDirectory, `${date}.md`);
      const [overview, projects, resources, dailyLog] = await Promise.all([
        bridge.vault.readFile("00_总览.md"),
        bridge.vault.readFile("02_项目库.md"),
        paths.has("03_资源索引.md") ? bridge.vault.readFile("03_资源索引.md") : Promise.resolve(null),
        bridge.vault.readFile(dailyPath),
      ]);
      const snapshot = createPersonalOsSnapshot({
        activeProjectId,
        dailyDirectory,
        dailyLog,
        date,
        overview,
        projects,
        resources,
      });
      const nextActiveProjectId = snapshot.projects.some((project) => project.id === activeProjectId)
        ? activeProjectId
        : snapshot.projects[0]?.id ?? null;
      if (nextActiveProjectId !== activeProjectId) {
        setActiveProjectId(nextActiveProjectId);
        writeActiveProjectId(nextActiveProjectId);
      }
      setState({ kind: "ready", snapshot: { ...snapshot, activeProjectId: nextActiveProjectId } });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "读取 Markdown 文件时出现未知错误。" });
    }
  }, [activeProjectId, bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!bridge?.vault.onDidChange) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    return bridge.vault.onDidChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, 300);
    });
  }, [bridge, refresh]);

  const chooseDirectory = useCallback(async () => {
    setNotice(null);
    try {
      await onChooseDirectory();
      await refresh();
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "无法选择 Markdown 文件夹。" });
    }
  }, [onChooseDirectory, refresh]);

  const selectProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    writeActiveProjectId(projectId);
    setState((current) => current.kind === "ready" ? { ...current, snapshot: { ...current.snapshot, activeProjectId: projectId } } : current);
  }, []);

  const readySnapshot = state.kind === "ready" ? state.snapshot : null;
  const selectedProject = useMemo(() => readySnapshot?.projects.find((project) => project.id === recordProjectId) ?? null, [readySnapshot, recordProjectId]);

  const submitSession = useCallback(async (session: StudySessionInput) => {
    if (!bridge || !readySnapshot) return;
    const project = readySnapshot.projects.find((candidate) => candidate.id === session.projectId);
    if (!project) return;
    setIsSubmitting(true);
    try {
      const datePath = joinRelativePath(readySnapshot.dailyDirectory, `${readySnapshot.date}.md`);
      const existingContent = await bridge.vault.readFile(datePath);
      const appended = appendStudySession({
        dailyDirectory: readySnapshot.dailyDirectory,
        date: readySnapshot.date,
        existingContent,
        project,
        session,
        sessionId: createSessionId(),
      });
      if (!appended.duplicate) await bridge.vault.saveFile(appended.path, appended.content);
      setNotice(appended.duplicate ? "该学习记录已存在，未重复写入。" : "学习记录已追加到今日 Markdown 日记。" );
      setRecordProjectId(null);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? `写入失败：${error.message}` : "写入每日记录失败。原文件未被覆盖。");
    } finally {
      setIsSubmitting(false);
    }
  }, [bridge, readySnapshot, refresh]);

  if (!readySnapshot) {
    return <DashboardNotice onConnect={() => { void chooseDirectory(); }} onRefresh={() => { void refresh(); }} state={state} />;
  }

  const activeProject = readySnapshot.projects.find((project) => project.id === readySnapshot.activeProjectId) ?? readySnapshot.projects[0] ?? null;
  return (
    <section aria-label="个人操作系统" className="personal-os-dashboard">
      <header className="personal-os-dashboard__header">
        <div><small>Markdown 个人操作系统</small><strong>{readySnapshot.overview.cycle || "当前周期未设置"}</strong><p>{readySnapshot.overview.dailyCapacity || "每日投入时间待补充"}</p></div>
        <div className="personal-os-dashboard__header-actions"><span>{readySnapshot.dailySessionCount} 次今日记录</span><button className="personal-os-button personal-os-button--quiet" onClick={() => { void chooseDirectory(); }} type="button">切换文件夹</button><button className="personal-os-button personal-os-button--quiet" onClick={() => { void refresh(); }} type="button">刷新</button></div>
      </header>
      {notice ? <p className="personal-os-dashboard__notice" role="status">{notice}</p> : null}
      {activeProject ? <ProjectSummary isActive onChoose={() => selectProject(activeProject.id)} onRecord={() => setRecordProjectId(activeProject.id)} project={activeProject} /> : null}
      <div className="personal-os-dashboard__grid">
        {readySnapshot.projects.filter((project) => project.id !== activeProject?.id).map((project) => <ProjectSummary isActive={false} key={project.id} onChoose={() => selectProject(project.id)} onRecord={() => setRecordProjectId(project.id)} project={project} />)}
        <article className="personal-os-card personal-os-resources"><small>资源入口</small><strong>课程与工具索引</strong>{readySnapshot.resources.length ? <ul>{readySnapshot.resources.slice(0, 4).map((resource) => <li key={`${resource.name}-${resource.project}`}><span>{resource.name}</span><small>{resource.status} · {resource.project}</small></li>)}</ul> : <p>资源索引尚未连接或暂无可展示条目。</p>}</article>
      </div>
      {selectedProject ? <StudySessionDialog onClose={() => setRecordProjectId(null)} onSubmit={submitSession} project={selectedProject} submitting={isSubmitting} /> : null}
    </section>
  );
}
