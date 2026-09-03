import type { AppWorkspaceId } from "@/features/app-runtime/app-runtime.types";

export type DesktopNavGroupId = "primary" | "library" | "tools";

export type DesktopNavItem = {
  description: string;
  group: DesktopNavGroupId;
  href: string;
  id: string;
  label: string;
  runtimeWorkspace?: AppWorkspaceId;
};

export type DesktopShowcaseCard = {
  accent: string;
  id: string;
  locale?: string;
  note?: string;
  subtitle?: string;
  title: string;
  tone: "audio" | "cover" | "document" | "video";
};

export type DesktopTopic = {
  category: string;
  excerpt: string;
  id: string;
  replies: number;
  title: string;
  updatedAt: string;
};

export type DesktopSettingGroup = {
  description: string;
  id: string;
  title: string;
  value: string;
};

export type DesktopRankingItem = {
  id: string;
  label: string;
  value: string;
};

export type DesktopRhythmItem = {
  detail: string;
  id: string;
  title: string;
};

export const DESKTOP_NAV_GROUP_LABELS: Record<DesktopNavGroupId, string> = {
  library: "资源",
  primary: "开始",
  tools: "工具",
};

export const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  {
    description: "今日知识工作台",
    group: "primary",
    href: "/",
    id: "home",
    label: "首页",
    runtimeWorkspace: "home",
  },
  {
    description: "本地笔记与知识库",
    group: "primary",
    href: "/notes",
    id: "notes",
    label: "本地笔记",
    runtimeWorkspace: "notes",
  },
  {
    description: "快速捕捉灵感闪念",
    group: "primary",
    href: "/flash",
    id: "flash",
    label: "灵感闪念",
  },
  {
    description: "每日回顾与间隔复习",
    group: "primary",
    href: "/review",
    id: "review",
    label: "每日回顾",
  },
  {
    description: "陪你学习、对话与回顾",
    group: "primary",
    href: "/nia",
    id: "nia",
    label: "Nia",
    runtimeWorkspace: "workspace",
  },
  {
    description: "双语精读、词链和批注",
    group: "primary",
    href: "/reading",
    id: "reading",
    label: "阅读精选",
    runtimeWorkspace: "workspace",
  },
  {
    description: "视频素材与英语陪练",
    group: "tools",
    href: "/video",
    id: "video",
    label: "视频",
    runtimeWorkspace: "workspace",
  },
  {
    description: "偏好、编辑器、集成与快捷键",
    group: "tools",
    href: "/settings",
    id: "settings",
    label: "系统设置",
  },
];

export const HOME_COURSE_CARDS: DesktopShowcaseCard[] = [
  {
    accent: "linear-gradient(135deg, #df6b65, #2f3248)",
    id: "course-ai-talk",
    subtitle: "How to talk with AI",
    title: "How to talk with AI",
    tone: "cover",
  },
  {
    accent: "linear-gradient(135deg, #dff0ff, #6eb3d3)",
    id: "course-conversation-101",
    subtitle: "Conversation 101",
    title: "Conversation 101: Universal...",
    tone: "cover",
  },
  {
    accent: "linear-gradient(135deg, #ffffff, #76b3dc)",
    id: "course-master-english",
    subtitle: "General themes",
    title: "Master English Conversation in 1...",
    tone: "cover",
  },
];

export const HOME_AUDIO_CARDS: DesktopShowcaseCard[] = [
  {
    accent: "#b8564f",
    id: "audio-turning-handicap",
    locale: "en-US",
    title: "Turning Handicap Into Valuable Asset",
    tone: "audio",
  },
  {
    accent: "#51a6e3",
    id: "audio-model-architecture",
    locale: "en-US",
    title: "Overview of the Model Architecture",
    tone: "audio",
  },
  {
    accent: "#ff7a2f",
    id: "audio-tortoises",
    locale: "en-US",
    title: "Ancestral Tortoises Adapted Creating...",
    tone: "audio",
  },
  {
    accent: "#cfb49a",
    id: "audio-lebanese",
    locale: "en-US",
    title: "Choosing Lebanese Restaurant Over...",
    tone: "audio",
  },
  {
    accent: "#6f7c49",
    id: "audio-smell",
    locale: "en-US",
    title: "Human Sense of Smell Feebleness",
    tone: "audio",
  },
  {
    accent: "#5b3852",
    id: "audio-1000-hours",
    locale: "en-US",
    title: "1000 小时day 14",
    tone: "audio",
  },
];

export const HOME_VIDEO_CARDS: DesktopShowcaseCard[] = [
  {
    accent: "linear-gradient(135deg, #1a1622, #493d69)",
    id: "video-night-shadowing",
    locale: "en-US",
    note: "添加的视频",
    title: "Street Interview Night Practice",
    tone: "video",
  },
  {
    accent: "linear-gradient(135deg, #2a2a2a, #6f6f6f)",
    id: "video-daily-expression",
    locale: "en-US",
    note: "添加的视频",
    title: "Daily Expression Capture",
    tone: "video",
  },
];

export const COMMUNITY_TOPICS: DesktopTopic[] = [
  {
    category: "用户分享",
    excerpt:
      "24 Hours User Ranking 橙子 1:18:45(79) 柯兰 57:03(153) 楚 47:03(15) 肖峰 16:17(150)...",
    id: "community-ranking",
    replies: 5,
    title: "Enjoy 用户练习排行榜",
    updatedAt: "2025 年 3 月",
  },
  {
    category: "常规",
    excerpt:
      "我们非常高兴看到您加入我们。在这里讨论关于 Enjoy 的一切。以下是一些可以帮助您入门的事情...",
    id: "community-welcome",
    replies: 2,
    title: "欢迎来到 Enjoy Discuss!",
    updatedAt: "2025 年 3 月",
  },
];

export const COMMUNITY_RANKING: DesktopRankingItem[] = [
  {
    id: "ranking-hours",
    label: "24 小时学习时长",
    value: "1:18:45",
  },
  {
    id: "ranking-streak",
    label: "连续练习冠军",
    value: "57 天",
  },
  {
    id: "ranking-sharing",
    label: "本周分享热度",
    value: "153",
  },
];

export const SETTINGS_GROUPS: DesktopSettingGroup[] = [
  {
    description: "决定界面提示语言和默认朗读语言。",
    id: "base-language",
    title: "母语 / 学习语言",
    value: "普通话 / English (United States)",
  },
  {
    description: "当前优先使用本地与云端混合的语音识别能力。",
    id: "stt-service",
    title: "语音转文本服务",
    value: "Azure (Enjoy 提供)",
  },
  {
    description: "训练页默认使用的引擎与生成模型。",
    id: "ai-engine",
    title: "默认 AI 引擎",
    value: "EnjoyAI / gpt-4o",
  },
  {
    description: "控制玻璃质感、色彩和紧凑度。",
    id: "appearance",
    title: "外观",
    value: "Aurora Slate",
  },
];

export const CHAT_THREAD_ITEMS = [
  {
    id: "chat-tts",
    subtitle: "该对话将提供文本转语音帮助",
    title: "TTS",
  },
  {
    id: "chat-home",
    subtitle: "A Year Ago",
    title: "Modern home kitchen dining area",
  },
  {
    id: "chat-phonics",
    subtitle: "A Year Ago",
    title: "Considerate Phon...",
  },
];

export const COURSE_RHYTHM_ITEMS: DesktopRhythmItem[] = [
  {
    detail: "先用主题课搭语境，把输入材料统一起来。",
    id: "rhythm-input",
    title: "输入热身",
  },
  {
    detail: "把课程台词和音频切到智能助手里继续做跟读。",
    id: "rhythm-shadowing",
    title: "跟读主练",
  },
  {
    detail: "回到纠音与笔记，把高频问题沉淀成自己的表达库。",
    id: "rhythm-review",
    title: "复盘沉淀",
  },
];

export const WORD_LIST_ITEMS = [
  {
    accent: "高频表达",
    meaning: "把 handicap 转成 asset 的表达习惯",
    word: "valuable asset",
  },
  {
    accent: "纠音关注",
    meaning: "收录最近评测里准确度波动较大的词",
    word: "dramatically",
  },
  {
    accent: "写作替换",
    meaning: "更自然地表达开始产生回报",
    word: "commenced",
  },
];
