# 服务层架构设计

## 问题分析

### 当前问题

#### 1. UI 组件直接调用数据库逻辑
```typescript
// ❌ Bad: 组件直接调用 repository
import { getSessionById } from '@/server/repositories/session-repository';

function MyComponent() {
  const session = await getSessionById(id);
  // ...
}
```

#### 2. 业务逻辑分散
- 验证逻辑在组件中
- 数据转换在多处重复
- 错误处理不统一

#### 3. 缺少依赖注入
- 难以测试（无法 mock 依赖）
- 紧耦合到具体实现
- 无法灵活切换实现

## 解决方案：三层架构

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │  ← React 组件 + Hooks
│  - UI Components                        │
│  - Query Hooks (useSession, etc.)      │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Service Layer (NEW)             │  ← 业务逻辑层
│  - SessionService                       │
│  - WordbookService                      │
│  - SentencebookService                  │
│  - Business Logic                       │
│  - Validation                           │
│  - Data Transformation                  │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Data Layer                      │  ← 数据访问层
│  - Repositories                         │
│  - Supabase Client                      │
│  - Local Storage                        │
└─────────────────────────────────────────┘
```

## 服务层设计原则

### 1. 单一职责原则（SRP）
每个服务只负责一个业务领域

```typescript
// ✅ Good: 每个服务专注于一个领域
class SessionService {
  // 只处理 session 相关业务
}

class WordbookService {
  // 只处理 wordbook 相关业务
}
```

### 2. 依赖倒置原则（DIP）
依赖抽象而不是具体实现

```typescript
// ✅ Good: 依赖接口
interface ISessionRepository {
  getById(id: string): Promise<Session>;
}

class SessionService {
  constructor(private repository: ISessionRepository) {}
}
```

### 3. 接口隔离原则（ISP）
客户端不应该依赖它不需要的接口

```typescript
// ✅ Good: 细粒度接口
interface ISessionReader {
  getById(id: string): Promise<Session>;
}

interface ISessionWriter {
  create(data: CreateSessionInput): Promise<Session>;
}
```

## 服务层职责

### 1. 业务逻辑
```typescript
class SessionService {
  async createSession(input: CreateSessionInput): Promise<Session> {
    // 验证输入
    this.validateInput(input);
    
    // 业务规则
    if (input.originalText.length > 10000) {
      throw new Error('Text too long');
    }
    
    // 调用 repository
    return this.repository.create(input);
  }
}
```

### 2. 数据验证
```typescript
class WordbookService {
  private validateWord(word: SavedWordRecord): void {
    if (!word.word.trim()) {
      throw new ValidationError('Word cannot be empty');
    }
    
    if (word.definitions.length === 0) {
      throw new ValidationError('At least one definition required');
    }
  }
}
```

### 3. 数据转换
```typescript
class SessionService {
  async getSessionWithArtifacts(id: string): Promise<SessionPlayback> {
    const session = await this.repository.getById(id);
    const artifacts = await this.repository.getArtifacts(id);
    
    // 转换为前端需要的格式
    return {
      session,
      sentences: artifacts.sentences,
      wordTokens: artifacts.wordTokens,
    };
  }
}
```

### 4. 错误处理
```typescript
class SessionService {
  async getSession(id: string): Promise<Session> {
    try {
      return await this.repository.getById(id);
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        throw new SessionNotFoundError(id);
      }
      throw new SessionServiceError('Failed to get session', error);
    }
  }
}
```

## 依赖注入设计

### 1. 构造函数注入（推荐）
```typescript
class SessionService {
  constructor(
    private repository: ISessionRepository,
    private logger: ILogger
  ) {}
}
```

### 2. 服务容器
```typescript
class ServiceContainer {
  private services = new Map<string, any>();
  
  register<T>(key: string, factory: () => T): void {
    this.services.set(key, factory);
  }
  
  resolve<T>(key: string): T {
    const factory = this.services.get(key);
    if (!factory) throw new Error(`Service not found: ${key}`);
    return factory();
  }
}
```

### 3. React Context 集成
```typescript
const ServiceContext = createContext<ServiceContainer | null>(null);

export function useService<T>(key: string): T {
  const container = useContext(ServiceContext);
  if (!container) throw new Error('ServiceContainer not provided');
  return container.resolve<T>(key);
}
```

## 服务接口定义

### ISessionService
```typescript
interface ISessionService {
  // 查询
  getById(id: string): Promise<Session>;
  getWithArtifacts(id: string): Promise<SessionPlayback>;
  listRecent(userId: string): Promise<Session[]>;
  
  // 创建
  create(input: CreateSessionInput): Promise<Session>;
  
  // 更新
  saveArtifacts(input: SaveArtifactsInput): Promise<Session>;
  
  // 删除
  delete(id: string): Promise<void>;
  
  // 业务逻辑
  prepareSession(input: PrepareSessionInput): Promise<SessionPlayback>;
}
```

### IWordbookService
```typescript
interface IWordbookService {
  // 查询
  listAll(): Promise<SavedWordRecord[]>;
  search(query: string): Promise<SavedWordRecord[]>;
  hasWord(word: string): Promise<boolean>;
  
  // 创建
  addWord(word: SavedWordRecord): Promise<void>;
  
  // 删除
  removeWord(word: string): Promise<void>;
  
  // 业务逻辑
  importWords(words: SavedWordRecord[]): Promise<ImportResult>;
  exportWords(): Promise<string>;
}
```

## 错误处理策略

### 自定义错误类
```typescript
// 基础错误类
class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// 具体错误类
class SessionNotFoundError extends ServiceError {
  constructor(sessionId: string) {
    super(
      `Session not found: ${sessionId}`,
      'SESSION_NOT_FOUND'
    );
  }
}

class ValidationError extends ServiceError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR');
  }
}
```

### 错误处理中间件
```typescript
class SessionService {
  private async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger.error(`${context} failed`, error);
      
      if (error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        `${context} failed`,
        'UNKNOWN_ERROR',
        error
      );
    }
  }
}
```

## 测试策略

### 1. 单元测试（Service）
```typescript
describe('SessionService', () => {
  let service: SessionService;
  let mockRepository: jest.Mocked<ISessionRepository>;
  
  beforeEach(() => {
    mockRepository = {
      getById: jest.fn(),
      create: jest.fn(),
    };
    
    service = new SessionService(mockRepository);
  });
  
  it('should get session by id', async () => {
    mockRepository.getById.mockResolvedValue(mockSession);
    
    const result = await service.getById('123');
    
    expect(result).toEqual(mockSession);
    expect(mockRepository.getById).toHaveBeenCalledWith('123');
  });
});
```

### 2. 集成测试（Service + Repository）
```typescript
describe('SessionService Integration', () => {
  let service: SessionService;
  let repository: SessionRepository;
  
  beforeEach(() => {
    repository = new SessionRepository(testSupabaseClient);
    service = new SessionService(repository);
  });
  
  it('should create and retrieve session', async () => {
    const created = await service.create(input);
    const retrieved = await service.getById(created.id);
    
    expect(retrieved).toEqual(created);
  });
});
```

## 迁移策略

### Phase 1: 创建服务层
1. 定义服务接口
2. 实现服务类
3. 编写单元测试

### Phase 2: 实现依赖注入
1. 创建服务容器
2. 注册服务
3. 集成到 React

### Phase 3: 重构 Query Hooks
1. 更新 hooks 使用服务
2. 移除直接 repository 调用
3. 更新测试

### Phase 4: 清理和优化
1. 移除冗余代码
2. 优化性能
3. 完善文档

## 性能考虑

### 1. 服务单例
```typescript
// ✅ Good: 服务作为单例
const container = new ServiceContainer();
container.register('sessionService', () => new SessionService(repository));

// 多次调用返回同一实例
const service1 = container.resolve('sessionService');
const service2 = container.resolve('sessionService');
// service1 === service2
```

### 2. 懒加载
```typescript
class ServiceContainer {
  private instances = new Map<string, any>();
  
  resolve<T>(key: string): T {
    // 只在第一次调用时创建实例
    if (!this.instances.has(key)) {
      const factory = this.factories.get(key);
      this.instances.set(key, factory());
    }
    return this.instances.get(key);
  }
}
```

### 3. 缓存
```typescript
class SessionService {
  private cache = new Map<string, Session>();
  
  async getById(id: string): Promise<Session> {
    // 先查缓存
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }
    
    // 缓存未命中，查询数据库
    const session = await this.repository.getById(id);
    this.cache.set(id, session);
    return session;
  }
}
```

## 最佳实践

### 1. 保持服务无状态
```typescript
// ❌ Bad: 服务有状态
class SessionService {
  private currentSession: Session | null = null;
}

// ✅ Good: 服务无状态
class SessionService {
  async getById(id: string): Promise<Session> {
    return this.repository.getById(id);
  }
}
```

### 2. 使用接口而不是具体类
```typescript
// ❌ Bad: 依赖具体类
class SessionService {
  constructor(private repository: SessionRepository) {}
}

// ✅ Good: 依赖接口
class SessionService {
  constructor(private repository: ISessionRepository) {}
}
```

### 3. 避免循环依赖
```typescript
// ❌ Bad: 循环依赖
class SessionService {
  constructor(private wordbookService: WordbookService) {}
}

class WordbookService {
  constructor(private sessionService: SessionService) {}
}

// ✅ Good: 使用事件或共享服务
class SessionService {
  constructor(private eventBus: EventBus) {}
}

class WordbookService {
  constructor(private eventBus: EventBus) {}
}
```

## 总结

服务层架构的优势：
- ✅ 解耦 UI 和数据层
- ✅ 集中业务逻辑
- ✅ 易于测试
- ✅ 易于维护
- ✅ 灵活切换实现

下一步：实现具体的服务类和依赖注入容器。
