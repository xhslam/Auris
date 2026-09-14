# State Management Migration Guide

## Overview

This guide provides step-by-step instructions for migrating from the current mixed state management approach to the unified TanStack Query + Zustand architecture.

## Prerequisites

```bash
npm install @tanstack/react-query zustand immer
npm install -D @tanstack/react-query-devtools
```

## Migration Checklist

### Phase 1: Setup Infrastructure ✅

- [x] Install dependencies
- [x] Create `src/lib/query-client.ts`
- [x] Create `src/stores/app-store.ts`
- [x] Add QueryClientProvider to root layout
- [x] Add React Query DevTools

### Phase 2: Migrate Server State

#### Step 1: Wrap App with QueryClientProvider

```typescript
// src/app/layout.tsx
'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/query-client';

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
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

#### Step 2: Migrate Session Queries

**Before:**
```typescript
// src/features/workspace/use-workspace-session-runtime.ts
const [playback, setPlayback] = useState<SessionPlayback | null>(null);
const [isHydratingPlayback, setIsHydratingPlayback] = useState(false);

useEffect(() => {
  if (!sessionId) return;

  setIsHydratingPlayback(true);
  getSessionById(sessionId)
    .then((session) => {
      if (session) {
        return getSessionArtifacts(sessionId).then((artifacts) => ({
          session,
          ...artifacts,
        }));
      }
    })
    .then((data) => {
      if (data) {
        setPlayback({
          session: data.session,
          sentences: data.sentences,
          wordTokens: data.wordTokens,
        });
      }
    })
    .finally(() => {
      setIsHydratingPlayback(false);
    });
}, [sessionId]);
```

**After:**
```typescript
// src/features/workspace/use-workspace-session-runtime.ts
import { useSession, useSessionArtifacts } from '@/features/sessions/use-session-query';

const { data: session, isLoading: isLoadingSession } = useSession(sessionId);
const { data: artifacts, isLoading: isLoadingArtifacts } = useSessionArtifacts(sessionId);

const isHydratingPlayback = isLoadingSession || isLoadingArtifacts;

const playback = useMemo(() => {
  if (!session || !artifacts) return null;
  return {
    session,
    sentences: artifacts.sentences,
    wordTokens: artifacts.wordTokens,
  };
}, [session, artifacts]);
```

#### Step 3: Migrate Session Mutations

**Before:**
```typescript
const handleCreateSession = async () => {
  setIsCreating(true);
  try {
    const newSession = await createEmptySessionRecord({
      userId,
      sourceType: 'text',
      title: 'New Session',
      originalText: text,
    });
    setRecent([newSession, ...recent]);
    router.push(`/workspace/${newSession.id}`);
  } catch (error) {
    console.error('Failed to create session:', error);
  } finally {
    setIsCreating(false);
  }
};
```

**After:**
```typescript
import { useCreateSession } from '@/features/sessions/use-session-query';

const createSession = useCreateSession();

const handleCreateSession = () => {
  createSession.mutate(
    {
      userId,
      sourceType: 'text',
      title: 'New Session',
      originalText: text,
    },
    {
      onSuccess: (newSession) => {
        router.push(`/workspace/${newSession.id}`);
      },
      onError: (error) => {
        console.error('Failed to create session:', error);
        // Show toast notification
      },
    }
  );
};
```

### Phase 3: Migrate Client State

#### Step 1: Migrate Training Settings

**Before:**
```typescript
// Component using localStorage directly
const [settings, setSettings] = useState(() => 
  readTrainingSettings(localStorage)
);

useEffect(() => {
  writeTrainingSettings(localStorage, settings);
}, [settings]);

const updateRepeatCount = (count: number) => {
  setSettings({ ...settings, repeatCount: count });
};
```

**After:**
```typescript
// Component using Zustand store
import { useTrainingSettingsStore } from '@/stores/app-store';

const { settings, updateSettings } = useTrainingSettingsStore();

const updateRepeatCount = (count: number) => {
  updateSettings({ repeatCount: count });
};
```

#### Step 2: Migrate Workspace UI State

**Before:**
```typescript
const [leftPanelWidth, setLeftPanelWidth] = useState(400);
const [rightPanelWidth, setRightPanelWidth] = useState(600);
const [isRecorderOpen, setIsRecorderOpen] = useState(false);

// Persist to localStorage manually
useEffect(() => {
  localStorage.setItem('workspace-layout', JSON.stringify({
    leftPanelWidth,
    rightPanelWidth,
    isRecorderOpen,
  }));
}, [leftPanelWidth, rightPanelWidth, isRecorderOpen]);
```

**After:**
```typescript
import { useWorkspaceUIStore } from '@/stores/app-store';

const {
  leftPanelWidth,
  rightPanelWidth,
  isRecorderOpen,
  setLeftPanelWidth,
  setRightPanelWidth,
  toggleRecorder,
} = useWorkspaceUIStore();

// No manual persistence needed - Zustand handles it
```

#### Step 3: Optimize with Selectors

**Before (causes unnecessary re-renders):**
```typescript
const store = useWorkspaceUIStore();
return <div style={{ width: store.leftPanelWidth }}>...</div>;
```

**After (only re-renders when leftPanelWidth changes):**
```typescript
const leftPanelWidth = useWorkspaceUIStore((state) => state.leftPanelWidth);
return <div style={{ width: leftPanelWidth }}>...</div>;
```

### Phase 4: Remove Old State Management

#### Files to Delete

- `src/features/settings/training-settings-store.ts` (logic moved to Zustand)
- `src/features/wordbook/local-wordbook-store.ts` (migrate to TanStack Query)
- `src/features/sentencebook/local-sentencebook-store.ts` (migrate to TanStack Query)

#### Files to Update

- Remove manual `useState` + `useEffect` + localStorage patterns
- Replace with Zustand stores or TanStack Query hooks
- Update imports throughout the codebase

## Common Patterns

### Pattern 1: Loading States

**Before:**
```typescript
const [data, setData] = useState(null);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState(null);

useEffect(() => {
  setIsLoading(true);
  fetchData()
    .then(setData)
    .catch(setError)
    .finally(() => setIsLoading(false));
}, []);
```

**After:**
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
});
```

### Pattern 2: Optimistic Updates

**Before:**
```typescript
const handleDelete = async (id: string) => {
  // Optimistic update
  setItems(items.filter(item => item.id !== id));
  
  try {
    await deleteItem(id);
  } catch (error) {
    // Rollback
    setItems(originalItems);
  }
};
```

**After:**
```typescript
const deleteMutation = useMutation({
  mutationFn: deleteItem,
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ['items'] });
    const previous = queryClient.getQueryData(['items']);
    queryClient.setQueryData(['items'], (old) => 
      old.filter(item => item.id !== id)
    );
    return { previous };
  },
  onError: (err, id, context) => {
    queryClient.setQueryData(['items'], context.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['items'] });
  },
});
```

### Pattern 3: Dependent Queries

**Before:**
```typescript
const [user, setUser] = useState(null);
const [posts, setPosts] = useState([]);

useEffect(() => {
  fetchUser().then(setUser);
}, []);

useEffect(() => {
  if (user) {
    fetchPosts(user.id).then(setPosts);
  }
}, [user]);
```

**After:**
```typescript
const { data: user } = useQuery({
  queryKey: ['user'],
  queryFn: fetchUser,
});

const { data: posts } = useQuery({
  queryKey: ['posts', user?.id],
  queryFn: () => fetchPosts(user!.id),
  enabled: !!user,
});
```

### Pattern 4: Prefetching

**Before:**
```typescript
const handleMouseEnter = () => {
  // No prefetching
};
```

**After:**
```typescript
const prefetchSession = usePrefetchSession();

const handleMouseEnter = () => {
  prefetchSession(sessionId);
};
```

## Testing

### Test Zustand Stores

```typescript
import { renderHook, act } from '@testing-library/react';
import { useTrainingSettingsStore } from '@/stores/app-store';

describe('TrainingSettingsStore', () => {
  beforeEach(() => {
    useTrainingSettingsStore.getState().resetSettings();
  });

  it('should update settings', () => {
    const { result } = renderHook(() => useTrainingSettingsStore());
    
    act(() => {
      result.current.updateSettings({ repeatCount: 3 });
    });
    
    expect(result.current.settings.repeatCount).toBe(3);
  });
});
```

### Test TanStack Query Hooks

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from '@/features/sessions/use-session-query';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useSession', () => {
  it('should fetch session', async () => {
    const { result } = renderHook(() => useSession('test-id'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });
});
```

## Troubleshooting

### Issue: "Cannot read property 'getState' of undefined"

**Solution:** Ensure Zustand store is imported correctly and not used before initialization.

### Issue: "Query data is undefined"

**Solution:** Check that `enabled` option is set correctly for dependent queries.

### Issue: "Too many re-renders"

**Solution:** Use selectors to subscribe to specific state slices instead of the entire store.

### Issue: "localStorage quota exceeded"

**Solution:** Implement data cleanup strategy or use IndexedDB for large datasets.

## Performance Tips

1. **Use shallow comparison for multiple selectors:**
   ```typescript
   import { shallow } from 'zustand/shallow';
   
   const { a, b } = useStore((state) => ({ a: state.a, b: state.b }), shallow);
   ```

2. **Debounce expensive updates:**
   ```typescript
   const debouncedUpdate = useMemo(
     () => debounce(updateSettings, 300),
     []
   );
   ```

3. **Use `staleTime` to reduce refetches:**
   ```typescript
   useQuery({
     queryKey: ['data'],
     queryFn: fetchData,
     staleTime: 5 * 60 * 1000, // 5 minutes
   });
   ```

4. **Prefetch on hover for better UX:**
   ```typescript
   <Link
     href={`/session/${id}`}
     onMouseEnter={() => prefetchSession(id)}
   >
     View Session
   </Link>
   ```

## Next Steps

1. Complete Phase 2 migration (server state)
2. Complete Phase 3 migration (client state)
3. Remove old state management code
4. Add comprehensive tests
5. Monitor performance metrics
6. Document any custom patterns

## Resources

- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Zustand Docs](https://docs.pmnd.rs/zustand)
- [Immer Docs](https://immerjs.github.io/immer/)
