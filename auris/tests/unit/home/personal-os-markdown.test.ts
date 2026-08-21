import { describe, expect, it } from "vitest";
import {
  appendStudySession,
  createPersonalOsSnapshot,
  findDailyDirectory,
  joinRelativePath,
} from "@/components/desktop/personal-os-markdown";

const overview = `# 个人操作系统｜总览

- 当前周期：未来两周
- 每日可投入时间：上午约 3 小时，下午约 4 小时，晚上约 3 小时，共约 10 小时

## 当前判断

每天开始时从两个项目中选择一个“主项目”，避免同时推进导致记录失焦。
`;

const projects = `# 项目库

## 项目 1｜考研数学线性代数和高数下

- 板块：学习/成长
- 两周结果：完成线性代数和高数下的所有内容
- 当前状态：
  - 线性代数剩余 6 章
  - 高数下剩余 4 章
- 下一步：先列出 10 个章节的具体名称和每章验收标准
- 状态：进行中
- 优先级：待确认

## 项目 2｜掌握控制考研

- 板块：学习/成长
- 两周结果：完成时域分析动态性能、稳态性能、根轨迹
- 当前状态：时域分析动态性能进行到一半
- 下一步：完成时域分析动态性能剩余部分
- 状态：进行中
- 优先级：待确认
`;

const resources = `# 资源索引

| 类别 | 资源 | 位置/提示 | 状态 | 关联项目 |
|---|---|---|---|---|
| 网盘课程 | 欧哥课程 | 网盘；具体路径待补 | 待整理 | 考研数学 |
| 网盘课程 | 控制考研课程 | 网盘；具体路径待补 | 使用中 | 掌握控制考研 |
`;

describe("personal-os-markdown", () => {
  it("parses the personal operating system without requiring YAML frontmatter", () => {
    const snapshot = createPersonalOsSnapshot({
      activeProjectId: null,
      date: "2026-08-21",
      overview,
      projects,
      resources,
    });

    expect(snapshot.overview.cycle).toBe("未来两周");
    expect(snapshot.projects).toHaveLength(2);
    expect(snapshot.projects[0]).toMatchObject({
      area: "学习/成长",
      goal: "完成线性代数和高数下的所有内容",
      nextStep: "先列出 10 个章节的具体名称和每章验收标准",
      title: "考研数学线性代数和高数下",
    });
    expect(snapshot.projects[0]?.currentState).toEqual(["线性代数剩余 6 章", "高数下剩余 4 章"]);
    expect(snapshot.resources).toEqual([
      { category: "网盘课程", name: "欧哥课程", locationHint: "网盘；具体路径待补", status: "待整理", project: "考研数学" },
      { category: "网盘课程", name: "控制考研课程", locationHint: "网盘；具体路径待补", status: "使用中", project: "掌握控制考研" },
    ]);
  });

  it("finds the daily directory and keeps nested workspaces relative", () => {
    expect(findDailyDirectory(["00_总览.md", "ops/daily/模板.md", "02_项目库.md"])).toBe("ops/daily");
    expect(joinRelativePath("ops/daily", "2026-08-21.md")).toBe("ops/daily/2026-08-21.md");
  });

  it("appends an auditable study session once and detects the stable marker", () => {
    const project = createPersonalOsSnapshot({ activeProjectId: null, projects }).projects[0]!;
    const first = appendStudySession({
      dailyDirectory: "daily",
      date: "2026-08-21",
      existingContent: "# 2026-08-21｜每日记录\n",
      project,
      session: {
        blocker: "特征值计算不熟练",
        content: "完成线性代数第二章课程",
        durationMinutes: 90,
        energyLevel: 4,
        nextStep: "完成对应练习",
        outcome: "整理 12 道例题",
        projectId: project.id,
      },
      sessionId: "session-001",
    });

    expect(first.path).toBe("daily/2026-08-21.md");
    expect(first.duplicate).toBe(false);
    expect(first.content).toContain("<!-- auris:personal-os-session:session-001 -->");
    expect(first.content).toContain("- 投入时间：90 分钟");
    expect(first.content).toContain("- 心情/能量：投入（4/5）");
    expect(first.content).toContain("- 卡点：特征值计算不熟练");

    const duplicate = appendStudySession({
      dailyDirectory: "daily",
      date: "2026-08-21",
      existingContent: first.content,
      project,
      session: {
        blocker: "",
        content: "ignored",
        durationMinutes: 25,
        energyLevel: 3,
        nextStep: "ignored",
        outcome: "ignored",
        projectId: project.id,
      },
      sessionId: "session-001",
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.content).toBe(first.content);
  });
});
