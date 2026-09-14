# Vault 大目录遍历修复：执行轨迹（2026-08-17）

## 问题与范围
桌面端调用 `shadowing:vault:list-files` 时显示 `RangeError: Maximum call stack size exceeded`。当前 Vault 为 `/Users/apple/Desktop`，其中包含大型开发目录；实际枚举到 330,633 条记录。

## 根因与方案
原主进程递归遍历函数在返回子目录结果时使用 `records.push(...childRecords)`。大型子树会把大量记录展开为一次函数调用的参数，触发 V8 调用参数上限。修复将遍历移至 `electron/vault/vault-file-walker.cjs`，使用显式待处理目录栈逐条追加记录，保留目录展示、根 `.shadowing` 排除和路径排序行为。

## 修改文件
| 文件 | 作用 |
|---|---|
| `electron/main.cjs` | 改用独立的迭代式遍历模块。 |
| `electron/vault/vault-file-walker.cjs` | 提供可注入 `readdir` 的迭代式 Vault 遍历实现。 |
| `tests/unit/electron/vault-file-walker.test.ts` | 覆盖嵌套目录、`.shadowing` 排除及 150,000 文件的大子树回归场景。 |

## 验证
- 新增的 2 项遍历测试通过，包括 150,000 文件的大子树。
- 相关 Vault 测试共 27 项通过。
- 在实际 Desktop Vault 上枚举成功：330,633 条记录，耗时约 3.46 秒，无调用栈错误。
- `node --check` 和 `git diff --check` 通过。

## 后续
仍需重新构建 macOS 安装包、安装更新后的应用，并在桌面应用中再次读取 Vault。

## 构建、安装与应用级验证
- 已执行 `npm run desktop:build:verify`：生产构建、桌面装配、打包隐私审计和 MCP sidecar 烟雾验证均通过。
- 已生成并校验修复版 `release/Auris-1.0.0-arm64.dmg` 与 macOS ZIP 包。
- 已将修复版应用安装到 `/Applications/Auris.app` 并正常启动。
- 已从已安装应用的 `app.asar` 提取并执行新遍历模块：实际 Desktop Vault 枚举 330,989 条记录，耗时约 4.21 秒，应用日志未发现新的 `Maximum call stack size exceeded` 条目。
