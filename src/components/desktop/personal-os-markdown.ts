export type PersonalOsProject = {
  id: string;
  title: string;
  area: string | null;
  goal: string | null;
  status: string | null;
  priority: string | null;
  nextStep: string | null;
  currentState: string[];
};

export type PersonalOsResource = {
  category: string;
  name: string;
  locationHint: string;
  status: string;
  project: string;
};

export type PersonalOsSnapshot = {
  activeProjectId: string | null;
  dailyDirectory: string;
  date: string;
  dailySessionCount: number;
  overview: {
    cycle: string | null;
    dailyCapacity: string | null;
    currentJudgement: string | null;
  };
  projects: PersonalOsProject[];
  resources: PersonalOsResource[];
};

export type EnergyLevel = 1 | 2 | 3 | 4 | 5;

export type StudySessionInput = {
  blocker: string;
  content: string;
  durationMinutes: number;
  energyLevel: EnergyLevel;
  nextStep: string;
  outcome: string;
  projectId: string;
};

export const energyLevelLabels: Record<EnergyLevel, string> = {
  1: "透支",
  2: "疲惫",
  3: "平稳",
  4: "投入",
  5: "充沛",
};

export type StudySessionAppendResult = {
  content: string;
  duplicate: boolean;
  path: string;
  sessionId: string;
};

const sessionMarkerPrefix = "<!-- auris:personal-os-session:";

function normalizeInline(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized || null;
}

function normalizeMultiline(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/^-\s*/, ""))
    .filter(Boolean)
    .join("；");
}

function asId(index: number, title: string): string {
  return `project-${index + 1}-${title}`
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || `project-${index + 1}`;
}

function splitSections(source: string, headingPattern: RegExp) {
  const matches = [...source.matchAll(headingPattern)];
  return matches.map((match, index) => ({
    body: source.slice(match.index! + match[0].length, matches[index + 1]?.index ?? source.length),
    title: match[1].trim(),
  }));
}

function fieldValue(section: string, label: string): string | null {
  const matcher = new RegExp(`^\\s*-\\s*${label}：?\\s*(.+?)\\s*$`, "m");
  return normalizeInline(section.match(matcher)?.[1]);
}

function listBelowField(section: string, label: string): string[] {
  const lines = section.replace(/\r\n?/g, "\n").split("\n");
  const anchor = lines.findIndex((line) => new RegExp(`^\\s*-\\s*${label}：?\\s*$`).test(line));
  if (anchor < 0) return [];
  const values: string[] = [];
  for (const line of lines.slice(anchor + 1)) {
    if (/^\s*##\s+/.test(line) || (/^\s*-\s*[^：]+：/.test(line) && !/^\s{2,}-\s+/.test(line))) break;
    const item = line.match(/^\s*-\s+(.+)$/)?.[1];
    if (item) values.push(item.trim());
    if (!line.trim() && values.length) break;
  }
  return values;
}

export function parseProjects(source: string): PersonalOsProject[] {
  return splitSections(source, /^##\s+项目\s*\d+\s*[｜|]\s*(.+)$/gm).map((section, index) => ({
    id: asId(index, section.title),
    title: section.title,
    area: fieldValue(section.body, "板块"),
    goal: fieldValue(section.body, "两周结果"),
    status: fieldValue(section.body, "状态"),
    priority: fieldValue(section.body, "优先级"),
    nextStep: fieldValue(section.body, "下一步"),
    currentState: listBelowField(section.body, "当前状态"),
  }));
}

export function parseResources(source: string): PersonalOsResource[] {
  const rows = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().startsWith("|") && !line.includes("---"));
  if (rows.length < 2) return [];
  return rows.slice(1).flatMap((row) => {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5 || cells.some((cell) => !cell)) return [];
    return [{
      category: cells[0],
      name: cells[1],
      locationHint: cells[2],
      status: cells[3],
      project: cells[4],
    }];
  });
}

export function parseOverview(source: string): PersonalOsSnapshot["overview"] {
  const cycle = normalizeInline(source.match(/^\s*-\s*当前周期：?\s*(.+?)\s*$/m)?.[1]);
  const dailyCapacity = normalizeInline(source.match(/^\s*-\s*每日可投入时间：?\s*(.+?)\s*$/m)?.[1]);
  const currentJudgementSection = source.match(/^##\s+当前判断\s*\n+([\s\S]*?)(?=^##\s+|\s*$)/m)?.[1];
  return {
    cycle,
    dailyCapacity,
    currentJudgement: normalizeInline(currentJudgementSection),
  };
}

export function getLocalDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createPersonalOsSnapshot(input: {
  activeProjectId: string | null;
  dailyDirectory?: string;
  dailyLog?: string | null;
  date?: string;
  overview?: string | null;
  projects?: string | null;
  resources?: string | null;
}): PersonalOsSnapshot {
  return {
    activeProjectId: input.activeProjectId,
    dailyDirectory: input.dailyDirectory || "daily",
    date: input.date || getLocalDateKey(),
    dailySessionCount: (input.dailyLog?.match(/<!-- auris:personal-os-session:/g) ?? []).length,
    overview: parseOverview(input.overview ?? ""),
    projects: parseProjects(input.projects ?? ""),
    resources: parseResources(input.resources ?? ""),
  };
}

function renderSessionField(label: string, value: string): string {
  const normalized = normalizeMultiline(value);
  return normalized ? `- ${label}：${normalized}` : `- ${label}：未填写`;
}

export function appendStudySession(input: {
  dailyDirectory?: string;
  date: string;
  existingContent: string | null;
  project: PersonalOsProject;
  session: StudySessionInput;
  sessionId: string;
}): StudySessionAppendResult {
  const marker = `${sessionMarkerPrefix}${input.sessionId} -->`;
  const path = joinRelativePath(input.dailyDirectory || "daily", `${input.date}.md`);
  const existing = input.existingContent ?? "";
  if (existing.includes(marker)) {
    return { content: existing, duplicate: true, path, sessionId: input.sessionId };
  }
  const duration = Math.max(1, Math.min(1_440, Math.round(input.session.durationMinutes || 25)));
  const energyLevel = Math.max(1, Math.min(5, Math.round(input.session.energyLevel || 3))) as EnergyLevel;
  const heading = existing.trim() ? "" : `# ${input.date}｜每日记录\n\n`;
  const entry = [
    marker,
    `### 学习时段｜${input.project.title}`,
    `- 投入时间：${duration} 分钟`,
    `- 心情/能量：${energyLevelLabels[energyLevel]}（${energyLevel}/5）`,
    renderSessionField("具体内容", input.session.content),
    renderSessionField("可验证结果", input.session.outcome),
    renderSessionField("卡点", input.session.blocker),
    renderSessionField("下一步", input.session.nextStep),
  ].join("\n");
  return {
    content: `${existing.trimEnd()}${heading || "\n\n"}${entry}\n`,
    duplicate: false,
    path,
    sessionId: input.sessionId,
  };
}

export function findDailyDirectory(paths: readonly string[]): string {
  const template = paths.find((path) => /(^|\/)daily\/模板\.md$/u.test(path));
  if (template) return template.slice(0, -"/模板.md".length);
  const existingLog = paths.find((path) => /(^|\/)daily\/\d{4}-\d{2}-\d{2}\.md$/u.test(path));
  if (existingLog) return existingLog.slice(0, existingLog.lastIndexOf("/"));
  return "daily";
}

export function joinRelativePath(directory: string, filename: string): string {
  return directory.replace(/^\/+|\/+$/g, "") ? `${directory.replace(/^\/+|\/+$/g, "")}/${filename}` : filename;
}
