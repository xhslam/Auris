# Nia and workflows

Nia is Auris's name for reusable AI definitions. Canonical exports use
`nia: v1`. Existing VMark-compatible `genie: v1`, legacy v0 definitions, and
`uses: genie/<name>` references are accepted only as import formats and are
normalized to Nia identity; Auris does not write new Genie-branded definitions.

Nia can receive browser, note, selection, or workflow context only after an
explicit user attachment. Suggested note edits are proposals: applying them
requires the expected note revision and selection review. Local conversation
history is opt-in.

## Safe definition example

```markdown
---
nia: v1
id: concise-summary
description: Summarize selected text without changing facts.
scope: selection
category: summarizing
action: insert
approval: ask
input:
  type: text
output:
  type: text
---

Summarize the supplied content. Return only the summary.

{{content}}
```

Definitions and workflows are reparsed from raw source in Electron main under
strict size, depth, alias, step, runtime, and output limits. Renderer ASTs and
caller-supplied action registries are not trusted.

## Two workflow families

`nia_yaml` is a dependency-aware YAML pipeline. Canonical steps use
`nia/<name>`; built-ins such as `nia/template` and `nia/prompt` are allowlisted.
Effectful `action/*` steps require injected review/approval support and fail
closed when unavailable.

```yaml
name: Local summary
nia: v1
inputs:
  text:
    type: text
steps:
  - id: render
    uses: nia/template
    with:
      template: "Summarize: {text}"
```

`browser_markdown` is a separate, site-bound browser automation format. It
compiles steps to typed intents, reacquires main-owned authority for every
attempt, and parks at user confirmation when required. Imported workflows are
reviewed before first execution. Recording replaces captured values with
declared opaque inputs; self-heal can only propose a bounded target change,
which must be reviewed and recompiled before fresh authorization.

Paused runs (`confirm`, `goal` / `nia_review`, or `browser_approval`) continue
through the public `resume` action on IPC, UI, and MCP (`approved` true/false;
`approvalId` when required). `goal:` uses main-injected `niaPropose` for a
bounded text proposal only — never an executable AST from the model.

```markdown
---
site: example.com
inputs: {}
trigger: manual
---

1. extract: title
2. confirm: Continue with the reviewed page?
```

Provider credentials never belong in either format. Configure a REST or fixed
CLI provider in Nia settings and refer to the provider/definition by ID. REST
keys are memory-only by default; “remember on this Mac” stores an opaque
Keychain reference. Cancelling a run aborts provider work and discards late
results; runs and results remain bound to their owner.

## In-app Nia browser tool loop

When the browser chrome Nia panel enables **Allow browser automation**, and
Settings has MCP/browser automation enabled with security gates verified, a
REST provider run (Anthropic / OpenAI / OpenAI-compatible) may call the host
tool `auris_browser`. Main owns the tool loop:

1. Connection id is `nia:<runId>` and lease `owner.kind` is `"nia"`.
2. The model never receives lease tokens; main acquires/releases control via
   the same command dispatcher MCP and `browser_markdown` use.
3. Allowed actions are a subset of MCP (`get_state`, `open`, `navigate`,
   `read`, `query`, `act`, `wait`, `wait_for`, `screenshot`, `focus`, `close`,
   acquire/release). `execute_js` and session replay stay out of this path.
4. Tool rounds are capped (8). Approvals still surface in the browser window;
   retry with `approvalId` after the user approves.

CLI providers cannot drive the in-app browser tool loop (their agentic tools
are not Auris tab control). Attach page title/URL alone remains available
without enabling automation.

