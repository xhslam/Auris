# 环境变量安全管理指南

## 概述

本项目使用环境变量来管理敏感配置信息。请遵循以下最佳实践。

## 环境变量分类

### 公开变量（可以提交到代码库）
- `NEXT_PUBLIC_APP_NAME` - 应用名称
- `NEXT_PUBLIC_APP_VERSION` - 应用版本
- `NEXT_PUBLIC_API_URL` - API 基础 URL（非敏感）

### 敏感变量（不能提交到代码库）
- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_ANON_KEY` - Supabase 匿名密钥
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase 服务角色密钥
- `DATABASE_URL` - 数据库连接字符串
- `OPENAI_API_KEY` - OpenAI API 密钥
- `ANTHROPIC_API_KEY` - Anthropic API 密钥

## 文件结构

```
.env.local          # 本地开发环境变量（不提交）
.env.example        # 环境变量模板（可提交）
.env.production     # 生产环境变量（不提交）
.env.test           # 测试环境变量（不提交）
```

## .env.example 模板

创建 `.env.example` 文件作为模板：

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Database
DATABASE_URL=your_database_url_here

# AI Services
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here

# Application
NEXT_PUBLIC_APP_NAME=English Shadowing Web
NEXT_PUBLIC_APP_VERSION=1.0.0
```

## 使用方法

### 1. 本地开发

```bash
# 复制模板文件
cp .env.example .env.local

# 编辑 .env.local 填入真实的密钥
nano .env.local
```

### 2. 在代码中访问环境变量

```typescript
// 服务端代码
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 客户端代码（只能访问 NEXT_PUBLIC_ 前缀的变量）
const appName = process.env.NEXT_PUBLIC_APP_NAME;
```

### 3. 验证环境变量

创建验证函数：

```typescript
// src/lib/env.ts
export function validateEnv() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}
```

## 安全最佳实践

### 1. 永远不要提交敏感信息

确保 `.gitignore` 包含：

```
.env.local
.env.production
.env.*.local
```

### 2. 使用密钥管理服务

生产环境建议使用：
- AWS Secrets Manager
- Azure Key Vault
- Google Cloud Secret Manager
- HashiCorp Vault

### 3. 定期轮换密钥

- 每 90 天轮换一次 API 密钥
- 发生安全事件时立即轮换
- 记录密钥轮换历史

### 4. 最小权限原则

- 只授予必要的权限
- 使用不同的密钥用于不同环境
- 限制密钥的访问范围

### 5. 监控和审计

- 记录所有密钥使用情况
- 设置异常使用告警
- 定期审查访问日志

## 部署到生产环境

### Vercel

```bash
# 使用 Vercel CLI 设置环境变量
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

### Docker

```bash
# 使用 docker-compose.yml
services:
  app:
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
```

### Kubernetes

```yaml
# 使用 Secret
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
data:
  supabase-url: <base64-encoded-value>
  supabase-key: <base64-encoded-value>
```

## 故障排查

### 环境变量未生效

1. 检查文件名是否正确（`.env.local`）
2. 重启开发服务器
3. 确认变量名拼写正确
4. 检查是否有前缀要求（`NEXT_PUBLIC_`）

### 密钥泄露应对

1. 立即撤销泄露的密钥
2. 生成新密钥
3. 更新所有环境的配置
4. 审查访问日志
5. 通知相关团队

## 参考资源

- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
