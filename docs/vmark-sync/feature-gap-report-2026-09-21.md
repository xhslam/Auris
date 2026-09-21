# Auris × VMark 增量更新与工程对齐报告（2026-09-21）

> 当前时间基准：2026-09-21（GMT+8）  
> 上游 VMark：`xiaolai/vmark` `main` @ `13720e0bff1dee9772b51ffeed345f7badf56aed`（v0.9.81 后 2 个提交）  
> 本地参考克隆：`vmark-upstream` 已成功 Fast-Forward 追平至 `13720e0bf`  
> 上游比对基线：`7c409688dc510d87183bdc46308e1ee645c2579f`  
> 报告产物：`docs/vmark-sync/latest.json` 与 `docs/vmark-sync/latest.md` 已同步生成

---

## 1. 上游更新深度复盘（VMark 55e3ef5 & 13720e0）

本次 VMark 远端更新包含两个聚焦于**开发基础设施（DX）**、**失效安全（Fail-Safe Security）**与**技术债务治理**的高信噪比提交：

| Commit | 标题 | 涉及文件 | 核心改动 |
|---|---|---|---|
| `55e3ef5` | `chore(codex): match the MCP block order cc-suite now writes (#1442)` | `.codex/config.toml` | 调整 `[mcp_servers.tauri]` 位置至 `[mcp_servers.claude-code]` 之后，迎合 `/cc-suite:bridge-mcp` 的稳定输出顺序，消解反复生成的假 dirty diff。 |
| `13720e0` | `chore: adopt cc-suite schema 8 (keeping the .agents/ hardening) and drop codex-cli MCP (#1443)` | `.gitignore`<br>`.mcp.json` | 1. 采纳 cc-suite schema 8，新增 `.cc-suite/audits/` 忽略。<br>2. 拒绝上游 schema 8 将 `.agents/` 拆为单文件清单的收窄改动，强制保留目录级 `.agents/` 忽略，防御权限为 0600 的凭据与敏感路径意外泄露。<br>3. 彻底删除连接失败（`CONNECTION_CLOSED`）的 `codex-cli` MCP 服务，明确降级为“未检测到集成并继续推进”。 |

---

## 2. 软件工程思维提炼与设计原则

本次对齐体现了三项极其关键的工程原则：

1. **顺应自动化工具的“确定性输出”（Deterministic Toolchain Hygiene）**：
   - TOML 表语义上无序，但自动化生成脚本会按特定顺序发射。若代码库与生成脚本顺序不符，每次构建或桥接运行都会产生无语义修改的 git 脏状态。用一次物理重排消除长久噪音。
2. **坚持“失效安全”默认值（Fail-Safe Security Defaults）**：
   - 上游模板试图对现存文件进行“精确匹配”，但敏感目录（如 `.agents/`，存放 subagent 运行态、工作区 token、机密环境）未来随时可能新增文件。单文件白名单在遇到未预料的文件时会变为 untracked，极易被 `git add -A` 误提交。整目录忽略属于**闭合兜底**，优于单文件穷举。
3. **消除僵尸依赖，显式定义优雅降级（Graceful Degradation over Zombie Services）**：
   - 外部服务长期连接失败时，挂在配置中只会产生启动超时和连接重试噪音。果断切除，并把回退逻辑明确记录在文档与规约中，保证系统高可用。

---

## 3. Auris 对齐落地与验证（Implementation & Verification）

### 3.1 本地参考克隆追平与 Provenance 报告刷新
- 执行 `git -C vmark-upstream fetch origin main` 与 `git -C vmark-upstream merge --ff-only origin/main`，将 Auris 内置的参考工作副本同步至 `13720e0bff1dee9772b51ffeed345f7badf56aed`。
- 运行 `node scripts/vmark-sync-report.cjs --repository-path vmark-upstream --upstream 13720e0bff1dee9772b51ffeed345f7badf56aed --diagnostics`，成功更新 `docs/vmark-sync/latest.json` 和 `latest.md`。

### 3.2 Auris 根目录 `.gitignore` 防御性加固
在 Auris 根目录 `.gitignore` 中吸收对齐规则：
```gitignore
# Python bytecode caches
__pycache__/
*.pyc

# AI assistant local state & multi-agent workspace protection (fail-safe directory ignore)
# .agents/ carries runtime credentials and machine paths; ignored as a directory to prevent leaks.
.agents/
.claude/settings.local.json
.claude/CLAUDE.local.md
.claude/*.local.*
CLAUDE.local.md
.cc-suite/audits/
.cc-suite/provenance
.cc-suite/original-claude.md
.cc-suite-*.provenance.json
```

**实机验证（Verified rather than assumed）**：
```bash
git check-ignore -v .agents/some-future-cc-suite-file.json .cc-suite/audits/finding.json test.pyc .claude/settings.local.json
```
- `.agents/some-future-cc-suite-file.json` -> 命中 `.gitignore:52:.agents/`
- `.cc-suite/audits/finding.json` -> 命中 `.gitignore:57:.cc-suite/audits/`
- `test.pyc` -> 命中 `.gitignore:48:*.pyc`
- `.claude/settings.local.json` -> 命中 `.gitignore:55:.claude/*.local.*`

### 3.3 Auris MCP 桥接与安装器合规性审查
- 复核 `electron/auris-mcp-installer.cjs`：
  - Auris 的 TOML 更新函数 `applyTomlChange` 采用 `locateTomlBlock` 局部匹配切片替换算法，仅对 `[mcp_servers.auris-notes]` 进行精准定位与就地更新，不会对用户的 `~/.codex/config.toml` 或其它 client 进行全量序列化重排，天生免疫块顺序重排导致的 diff 污染。
  - Auris 不持有对已废弃 `codex-cli` stdio 服务的硬编码外部调用，自身对外提供标准的 `auris-notes` MCP 服务。
- 运行定向回归测试：
  - `tests/unit/vmark/vmark-manifest.test.ts`、`tests/unit/vmark/vmark-sync-report.test.ts`：**51 项全部通过**。
  - `tests/unit/notes/mcp-installer.test.ts`、`tests/unit/electron/auris-mcp-config.test.ts`：**22 项全部通过**。
