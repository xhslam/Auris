# 状态管理快速参考

## 🎯 何时使用什么？

### React useState
**用于：** 临时 UI 状态
```typescript
const [isOpen, setIsOpen] = useState(false);
const [inputValue, setInputValue] = useState('');
```
**场景：** 模态框、输入框、临时标志

### Zustand Store
**用于：** 全局客户端状态
```typescript
const { settings, updateSettings } = useTrainingSettingsStore();
const leftPanelWidth = useWorkspaceUIStore((s) => s.leftPanelWidth);
```
**场景：** 用户偏好、UI 布局、应用配置

### TanStack Query
**用于：** 服务器数据
```typescript
const { data, isLoading } = useSession(sessionId);
const createSession = useCreateSession();
```
**场景：** API 数据、数据库记录、远程资源

## 📦 可用的 Stores

### Training Settings
```typescript
import { useTrainingSettingsStore } from '@/stores/app-store';

const { settings, updateSettings, resetSettings } = useTrainingSettingsStore();

// 更新设置
updateSettings({ repeatCount: 3, privacyMode: true });

// 重置为默认值
resetSettings();
```

### Workspace UI
```typescript
import { useWorkspaceUIStore } from '@/stores/app-store';

const {
  leftPanelWidth,
  setLeftPanelWidth,
  activeTab,
  setActiveTab,
  toggleRecorder,
  resetLayout,
} = useWorkspaceUIStore();
```

### Notes UI
```typescript
import { useNotesUIStore } from '@/stores/app-store';

const {
  sidebarWidth,
  toggleSidebar,
  terminalHeight,
  toggleTerminal,
  activeView,
  setActiveView,
} = useNotesUIStore();
```

### AI Dock
```typescript
import { useAIDockStore } from '@/stores/app-store';

const {
  isOpen,
  toggle,
  activeProvider,
  setActiveProvider,
  activeView,
  setActiveView,
} = useAIDockStore();
```

### App Preferences
```typescript
import { useAppPreferencesStore } from '@/stores/app-store';

const {
  theme,
  setTheme,
  language,
  setLanguage,
  enableAnimations,
  setEnableAnimations,
} = useAppPreferencesStore();
```

## 🔍 可用的 Query Hooks

### Sessions
```typescript
import {
  useSession,
  useSessionArtifacts,
  useRecentSessions,
  useCreateSession,
  useDeleteSession,
  useSaveSessionArtifacts,
  usePrefetchSession,
} from '@/features/sessions/use-session-query';

// 查询单个 session
const { data: session, isLoading, error } = useSession(sessionId);

// 查询 session 的 artifacts
const { data: artifacts } = useSessionArtifacts(sessionId);

// 查询最近的 sessions
const { data: recentSessions } = useRecentSessions(userId);

// 创建 session
const createSession = useCreateSession();
createSession.mutate({ userId, title, originalText });

// 删除 session
const deleteSession = useDeleteSession();
deleteSession.mutate(sessionId);

// 保存 session artifacts
const saveArtifacts = useSaveSessionArtifacts();
saveArtifacts.mutate({ sessionId, sentences, wordTokens });

// 预加载 session
const prefetch = usePrefetchSession();
prefetch(sessionId);
```

## 🎨 最佳实践

### 1. 使用选择器避免重渲染
```typescript
// ❌ Bad: 订阅整个 store
const store = useTrainingSettingsStore();

// ✅ Good: 只订阅需要的字段
const repeatCount = useTrainingSettingsStore((s) => s.settings.repeatCount);
```

### 2. 使用 shallow 比较多个字段
```typescript
import { shallow } from 'zustand/shallow';

const { repeatCount, repeatIntervalSec } = useTrainingSettingsStore(
  (s) => ({
    repeatCount: s.settings.repeatCount,
    repeatIntervalSec: s.settings.repeatIntervalSec,
  }),
  shallow
);
```

### 3. 预加载提升用户体验
```typescript
<Link
  href={`/session/${id}`}
  onMouseEnter={() => prefetchSession(id)}
>
  View Session
</Link>
```

### 4. 乐观更新
```typescript
const createSession = useCreateSession();

createSession.mutate(
  { userId, title, originalText },
  {
    onSuccess: (newSession) => {
      // 立即导航，不等待服务器响应
      router.push(`/session/${newSession.id}`);
    },
  }
);
```

### 5. 错误处理
```typescript
const { data, error, isError } = useSession(sessionId);

if (isError) {
  return <ErrorMessage error={error} />;
}
```

## 🔧 调试工具

### React Query DevTools
按 `Ctrl+Shift+D` 打开 DevTools（开发环境自动加载）

### Zustand DevTools
在浏览器 Redux DevTools 中查看 Zustand stores

### 查看缓存状态
```typescript
import { queryClient } from '@/lib/query-client';

// 查看所有缓存
console.log(queryClient.getQueryCache().getAll());

// 查看特定查询
console.log(queryClient.getQueryData(['sessions', sessionId]));
```

## 🚨 常见错误

### 1. 忘记启用查询
```typescript
// ❌ Bad: sessionId 为 null 时仍然查询
const { data } = useSession(sessionId);

// ✅ Good: 使用 enabled 选项
const { data } = useSession(sessionId, { enabled: !!sessionId });
```

### 2. 不使用选择器
```typescript
// ❌ Bad: 任何状态变化都会重渲染
const store = useTrainingSettingsStore();

// ✅ Good: 只在 repeatCount 变化时重渲染
const repeatCount = useTrainingSettingsStore((s) => s.settings.repeatCount);
```

### 3. 手动管理缓存
```typescript
// ❌ Bad: 手动清除缓存
queryClient.removeQueries(['sessions']);

// ✅ Good: 使用 invalidate 让 Query 自动重新获取
queryClient.invalidateQueries(['sessions']);
```

## 📖 更多资源

- [完整架构文档](./STATE_MANAGEMENT_ARCHITECTURE.md)
- [迁移指南](./STATE_MIGRATION_GUIDE.md)
- [迁移总结](./STATE_MIGRATION_SUMMARY.md)
- [TanStack Query 文档](https://tanstack.com/query/latest)
- [Zustand 文档](https://docs.pmnd.rs/zustand)
