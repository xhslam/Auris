# State Management Architecture

## Current Problems

### 1. **混乱的状态存储**
- ❌ 直接使用 `localStorage` (training-settings-store.ts)
- ❌ 自定义 store 模式 (vault-store.ts)
- ❌ 大量 `useState` + `useEffect` 组合
- ❌ 没有统一的持久化策略
- ❌ 状态分散在多个地方，难以追踪

### 2. **同步问题**
- ❌ 本地状态和服务器状态不同步
- ❌ 多个组件可能持有相同数据的不同副本
- ❌ 没有乐观更新策略
- ❌ 缺少错误恢复机制

### 3. **性能问题**
- ❌ 不必要的重渲染
- ❌ 没有状态选择器优化
- ❌ 大对象频繁序列化到 localStorage

## Proposed Architecture

### 核心原则

1. **单一数据源 (Single Source of Truth)**
2. **分层状态管理 (Layered State)**
3. **类型安全 (Type Safety)**
4. **可测试性 (Testability)**
5. **可观察性 (Observability)**

### 状态分层

```
┌─────────────────────────────────────────┐
│         UI State (React)                │  ← 临时UI状态
│  - 表单输入、模态框、加载状态            │
│  - useState, useReducer                 │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      Client State (Zustand)             │  ← 客户端全局状态
│  - 用户偏好、UI配置                      │
│  - 持久化到 localStorage                 │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│    Server State (TanStack Query)        │  ← 服务器数据缓存
│  - Sessions, Sentences, WordTokens      │
│  - 自动缓存、重新验证、乐观更新          │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      Data Layer (Repository)            │  ← 数据访问层
│  - Supabase + Local File Fallback       │
│  - 统一的数据访问接口                    │
└─────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: 引入 TanStack Query (React Query)

**目标**: 管理所有服务器状态

```typescript
// src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分钟
      gcTime: 10 * 60 * 1000,   // 10分钟
      retry: 3,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

**使用示例**:

```typescript
// src/features/sessions/use-session-query.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSessionById, createEmptySessionRecord } from '@/server/repositories/session-repository';

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => getSessionById(sessionId),
    enabled: !!sessionId,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createEmptySessionRecord,
    onSuccess: (newSession) => {
      // 乐观更新缓存
      queryClient.setQueryData(['sessions', newSession.id], newSession);
      queryClient.invalidateQueries({ queryKey: ['sessions', 'list'] });
    },
  });
}
```

### Phase 2: 统一 Zustand Store

**目标**: 管理所有客户端状态

```typescript
// src/stores/app-store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// 1. Training Settings Store
interface TrainingSettingsState {
  settings: TrainingSettings;
  updateSettings: (partial: Partial<TrainingSettings>) => void;
  resetSettings: () => void;
}

export const useTrainingSettingsStore = create<TrainingSettingsState>()(
  persist(
    immer((set) => ({
      settings: DEFAULT_TRAINING_SETTINGS,
      updateSettings: (partial) =>
        set((state) => {
          Object.assign(state.settings, partial);
        }),
      resetSettings: () =>
        set((state) => {
          state.settings = DEFAULT_TRAINING_SETTINGS;
        }),
    })),
    {
      name: 'training-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// 2. Workspace UI Store
interface WorkspaceUIState {
  leftPanelWidth: number;
  rightPanelWidth: number;
  isRecorderOpen: boolean;
  activeTab: 'source' | 'wordbook' | 'sentencebook';
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  toggleRecorder: () => void;
  setActiveTab: (tab: WorkspaceUIState['activeTab']) => void;
}

export const useWorkspaceUIStore = create<WorkspaceUIState>()(
  persist(
    immer((set) => ({
      leftPanelWidth: 400,
      rightPanelWidth: 600,
      isRecorderOpen: false,
      activeTab: 'source',
      setLeftPanelWidth: (width) =>
        set((state) => {
          state.leftPanelWidth = width;
        }),
      setRightPanelWidth: (width) =>
        set((state) => {
          state.rightPanelWidth = width;
        }),
      toggleRecorder: () =>
        set((state) => {
          state.isRecorderOpen = !state.isRecorderOpen;
        }),
      setActiveTab: (tab) =>
        set((state) => {
          state.activeTab = tab;
        }),
    })),
    {
      name: 'workspace-ui',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// 3. Wordbook Store (with optimistic updates)
interface WordbookState {
  words: SavedWordRecord[];
  isLoading: boolean;
  addWord: (word: SavedWordRecord) => void;
  removeWord: (word: string) => void;
  loadWords: () => Promise<void>;
}

export const useWordbookStore = create<WordbookState>()(
  immer((set, get) => ({
    words: [],
    isLoading: false,
    addWord: (word) =>
      set((state) => {
        // Optimistic update
        state.words.unshift(word);
      }),
    removeWord: (word) =>
      set((state) => {
        state.words = state.words.filter((w) => w.word !== word);
      }),
    loadWords: async () => {
      set((state) => {
        state.isLoading = true;
      });
      try {
        const storage = getBrowserWordbookStorage();
        if (storage) {
          const words = await storage.listWords();
          set((state) => {
            state.words = words;
            state.isLoading = false;
          });
        }
      } catch (error) {
        console.error('Failed to load words:', error);
        set((state) => {
          state.isLoading = false;
        });
      }
    },
  }))
);
```

### Phase 3: 状态选择器优化

**问题**: 组件订阅整个 store 导致不必要的重渲染

**解决方案**: 使用细粒度选择器

```typescript
// ❌ Bad: 订阅整个 store
function MyComponent() {
  const store = useTrainingSettingsStore();
  return <div>{store.settings.repeatCount}</div>;
}

// ✅ Good: 只订阅需要的字段
function MyComponent() {
  const repeatCount = useTrainingSettingsStore((state) => state.settings.repeatCount);
  return <div>{repeatCount}</div>;
}

// ✅ Better: 使用 shallow 比较
import { shallow } from 'zustand/shallow';

function MyComponent() {
  const { repeatCount, repeatIntervalSec } = useTrainingSettingsStore(
    (state) => ({
      repeatCount: state.settings.repeatCount,
      repeatIntervalSec: state.settings.repeatIntervalSec,
    }),
    shallow
  );
  return <div>{repeatCount} x {repeatIntervalSec}s</div>;
}
```

### Phase 4: 持久化策略

**目标**: 统一的持久化和同步机制

```typescript
// src/lib/storage/storage-adapter.ts
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Browser localStorage adapter
export const browserStorageAdapter: StorageAdapter = {
  async getItem(key) {
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    localStorage.setItem(key, value);
  },
  async removeItem(key) {
    localStorage.removeItem(key);
  },
};

// Electron IPC adapter (for desktop)
export const electronStorageAdapter: StorageAdapter = {
  async getItem(key) {
    return window.desktopBridge?.storage.get(key) ?? null;
  },
  async setItem(key, value) {
    await window.desktopBridge?.storage.set(key, value);
  },
  async removeItem(key) {
    await window.desktopBridge?.storage.remove(key);
  },
};

// Capacitor Preferences adapter (for mobile)
export const capacitorStorageAdapter: StorageAdapter = {
  async getItem(key) {
    const { value } = await Preferences.get({ key });
    return value;
  },
  async setItem(key, value) {
    await Preferences.set({ key, value });
  },
  async removeItem(key) {
    await Preferences.remove({ key });
  },
};

// Auto-detect platform
export function getStorageAdapter(): StorageAdapter {
  if (typeof window !== 'undefined') {
    if (window.desktopBridge) return electronStorageAdapter;
    if (window.Capacitor) return capacitorStorageAdapter;
    return browserStorageAdapter;
  }
  throw new Error('No storage adapter available');
}
```

### Phase 5: 状态同步中间件

**目标**: 自动同步本地和云端状态

```typescript
// src/lib/sync/sync-middleware.ts
import { StateCreator, StoreMutatorIdentifier } from 'zustand';

type SyncOptions = {
  key: string;
  syncToCloud?: boolean;
  debounceMs?: number;
};

export const syncMiddleware =
  <T>(options: SyncOptions): ((f: StateCreator<T>) => StateCreator<T>) =>
  (config) =>
  (set, get, api) => {
    let timeoutId: NodeJS.Timeout | null = null;

    const syncToCloud = async (state: T) => {
      if (!options.syncToCloud) return;

      try {
        // Upload to Supabase or other cloud storage
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: options.key, state }),
        });
      } catch (error) {
        console.error('Failed to sync to cloud:', error);
      }
    };

    return config(
      (partial, replace) => {
        set(partial, replace);

        // Debounced cloud sync
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          syncToCloud(get());
        }, options.debounceMs ?? 1000);
      },
      get,
      api
    );
  };
```

### Phase 6: DevTools 集成

**目标**: 可观察性和调试能力

```typescript
// src/lib/devtools.ts
import { devtools } from 'zustand/middleware';

export const useTrainingSettingsStore = create<TrainingSettingsState>()(
  devtools(
    persist(
      immer((set) => ({
        // ... store implementation
      })),
      { name: 'training-settings' }
    ),
    { name: 'TrainingSettings' }
  )
);
```

**React Query DevTools**:

```typescript
// src/app/layout.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </body>
    </html>
  );
}
```

## Migration Strategy

### Step 1: 安装依赖

```bash
npm install @tanstack/react-query zustand immer
npm install -D @tanstack/react-query-devtools
```

### Step 2: 迁移优先级

**High Priority (立即迁移)**:
1. Session 数据 → TanStack Query
2. Training Settings → Zustand
3. Workspace UI State → Zustand

**Medium Priority (逐步迁移)**:
4. Wordbook/Sentencebook → Zustand + TanStack Query
5. Notes Vault → Zustand
6. AI Dock State → Zustand

**Low Priority (可选)**:
7. 临时 UI 状态保持 useState

### Step 3: 迁移模板

**从 localStorage 迁移到 Zustand**:

```typescript
// Before
const [settings, setSettings] = useState(() => readTrainingSettings(localStorage));

useEffect(() => {
  writeTrainingSettings(localStorage, settings);
}, [settings]);

// After
const { settings, updateSettings } = useTrainingSettingsStore();
```

**从自定义 hook 迁移到 TanStack Query**:

```typescript
// Before
const [session, setSession] = useState<SessionRecord | null>(null);
const [isLoading, setIsLoading] = useState(false);

useEffect(() => {
  setIsLoading(true);
  getSessionById(sessionId)
    .then(setSession)
    .finally(() => setIsLoading(false));
}, [sessionId]);

// After
const { data: session, isLoading } = useSession(sessionId);
```

## Testing Strategy

### Unit Tests

```typescript
// src/stores/__tests__/training-settings-store.test.ts
import { renderHook, act } from '@testing-library/react';
import { useTrainingSettingsStore } from '../app-store';

describe('TrainingSettingsStore', () => {
  beforeEach(() => {
    useTrainingSettingsStore.getState().resetSettings();
  });

  it('should update repeat count', () => {
    const { result } = renderHook(() => useTrainingSettingsStore());

    act(() => {
      result.current.updateSettings({ repeatCount: 3 });
    });

    expect(result.current.settings.repeatCount).toBe(3);
  });

  it('should persist to localStorage', () => {
    const { result } = renderHook(() => useTrainingSettingsStore());

    act(() => {
      result.current.updateSettings({ repeatCount: 5 });
    });

    const stored = JSON.parse(localStorage.getItem('training-settings')!);
    expect(stored.state.settings.repeatCount).toBe(5);
  });
});
```

### Integration Tests

```typescript
// src/features/workspace/__tests__/workspace-integration.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceShell } from '../workspace-shell';

describe('Workspace Integration', () => {
  it('should load session and display content', async () => {
    render(
      <QueryClientProvider client={testQueryClient}>
        <WorkspaceShell sessionId="test-id" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/session loaded/i)).toBeInTheDocument();
    });
  });
});
```

## Performance Monitoring

### Metrics to Track

1. **State Update Frequency**: 每秒状态更新次数
2. **Re-render Count**: 组件重渲染次数
3. **Cache Hit Rate**: TanStack Query 缓存命中率
4. **Sync Latency**: 本地→云端同步延迟
5. **Storage Size**: localStorage 使用量

### Monitoring Tools

```typescript
// src/lib/monitoring/state-monitor.ts
export function monitorStateUpdates() {
  const originalSet = useTrainingSettingsStore.setState;

  useTrainingSettingsStore.setState = (...args) => {
    console.log('[State Update]', {
      store: 'TrainingSettings',
      timestamp: Date.now(),
      args,
    });
    return originalSet(...args);
  };
}
```

## Best Practices

### 1. 状态归属原则

- **UI State**: 只影响单个组件 → `useState`
- **Client State**: 跨组件共享、需要持久化 → Zustand
- **Server State**: 来自 API、需要缓存 → TanStack Query

### 2. 避免过度抽象

```typescript
// ❌ Bad: 不必要的全局状态
const useModalStore = create((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

// ✅ Good: 简单的本地状态
function MyModal() {
  const [isOpen, setIsOpen] = useState(false);
  // ...
}
```

### 3. 状态规范化

```typescript
// ❌ Bad: 嵌套数据
{
  sessions: [
    { id: '1', sentences: [...], wordTokens: [...] }
  ]
}

// ✅ Good: 扁平化
{
  sessions: { '1': { id: '1', ... } },
  sentences: { 'a': { id: 'a', sessionId: '1', ... } },
  wordTokens: { 'x': { id: 'x', sentenceId: 'a', ... } }
}
```

### 4. 乐观更新

```typescript
const { mutate } = useMutation({
  mutationFn: saveWord,
  onMutate: async (newWord) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['wordbook'] });

    // Snapshot previous value
    const previous = queryClient.getQueryData(['wordbook']);

    // Optimistically update
    queryClient.setQueryData(['wordbook'], (old) => [...old, newWord]);

    return { previous };
  },
  onError: (err, newWord, context) => {
    // Rollback on error
    queryClient.setQueryData(['wordbook'], context.previous);
  },
  onSettled: () => {
    // Refetch after mutation
    queryClient.invalidateQueries({ queryKey: ['wordbook'] });
  },
});
```

## Summary

这个架构方案解决了以下问题:

✅ **统一状态管理**: TanStack Query + Zustand 分层管理
✅ **类型安全**: 完整的 TypeScript 类型定义
✅ **性能优化**: 细粒度订阅、选择器优化
✅ **持久化**: 统一的存储适配器
✅ **同步策略**: 自动本地→云端同步
✅ **可测试性**: 清晰的测试策略
✅ **可观察性**: DevTools 集成
✅ **渐进式迁移**: 不需要一次性重写

预期收益:
- 减少 70% 的状态管理代码
- 减少 50% 的不必要重渲染
- 提升 3x 的开发效率
- 更好的用户体验（乐观更新、离线支持）
