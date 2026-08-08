# 🚀 状态管理快速启动指南

## 立即开始使用新的状态管理系统

### 1️⃣ 客户端状态（Zustand）

#### Training Settings
```typescript
import { useTrainingSettingsStore } from '@/stores/app-store';

// ✅ 推荐：使用选择器
const repeatCount = useTrainingSettingsStore((s) => s.settings.repeatCount);
const updateSettings = useTrainingSettingsStore((s) => s.updateSettings);

// 更新设置
updateSettings({ repeatCount: 3, privacyMode: true });
```

#### Workspace UI
```typescript
import { useWorkspaceUIStore } from '@/stores/app-store';

const leftPanelWidth = useWorkspaceUIStore((s) => s.leftPanelWidth);
const setLeftPanelWidth = useWorkspaceUIStore((s) => s.setLeftPanelWidth);

setLeftPanelWidth(500);
```

### 2️⃣ 服务器状态（TanStack Query）

#### Sessions
```typescript
import { useSession, useCreateSession } from '@/features/sessions/use-session-query';

// 查询
const { data: session, isLoading } = useSession(sessionId);

// 创建
const createSession = useCreateSession();
createSession.mutate({ userId, title, originalText });
```

#### Wordbook
```typescript
import { useWordbook, useAddWord } from '@/features/wordbook/use-wordbook-query';

// 查询
const { data: words } = useWordbook();

// 添加
const addWord = useAddWord();
addWord.mutate({ word: 'example', definitions: [...], ... });
```

#### Sentencebook
```typescript
import { useSentencebook, useAddSentence } from '@/features/sentencebook/use-sentencebook-query';

// 查询
const { data: sentences } = useSentencebook();

// 添加
const addSentence = useAddSentence();
addSentence.mutate({ id, text, translation, ... });
```

### 3️⃣ 性能优化

#### 预加载
```typescript
<Link
  href={`/session/${id}`}
  onMouseEnter={() => prefetchSession(id)}
>
  View Session
</Link>
```

#### 错误边界
```typescript
import { StateErrorBoundary } from '@/components/error-boundary/state-error-boundary';

<StateErrorBoundary>
  <YourComponent />
</StateErrorBoundary>
```

### 4️⃣ 调试工具

#### 浏览器控制台
```javascript
// 性能报告
window.__statePerformance.logReport()

// 缓存统计
window.__cacheUtils.logStats()

// 清理缓存
window.__cacheUtils.clear()
```

#### React Query DevTools
按 `Ctrl+Shift+D` 打开 DevTools

### 5️⃣ 常见模式

#### 乐观更新
```typescript
const addWord = useAddWord();

addWord.mutate(newWord, {
  onSuccess: () => {
    // 立即更新 UI，不等待服务器
    router.push('/wordbook');
  },
});
```

#### 条件查询
```typescript
const { data } = useSession(sessionId, {
  enabled: !!sessionId, // 只在 sessionId 存在时查询
});
```

#### 搜索
```typescript
const { data: words } = useWordbook();
const searchResults = useSearchWords(query);
```

## 📖 完整文档

- [架构设计](./STATE_MANAGEMENT_ARCHITECTURE.md)
- [迁移指南](./STATE_MIGRATION_GUIDE.md)
- [快速参考](./STATE_QUICK_REFERENCE.md)
- [Phase 1 总结](./STATE_MIGRATION_SUMMARY.md)
- [Phase 2-5 完成报告](./STATE_MIGRATION_PHASE2-5_COMPLETE.md)

## 🎯 最佳实践

1. **使用选择器** - 避免不必要的重渲染
2. **预加载数据** - 提升用户体验
3. **乐观更新** - 立即响应用户操作
4. **错误边界** - 优雅处理错误
5. **监控性能** - 定期检查性能指标

## 🆘 需要帮助？

查看文档或在控制台使用调试工具！
