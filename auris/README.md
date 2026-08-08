# Auris

Language learning through listening and shadowing — with login, cloud audio generation, and word-level synchronized highlighting.

The macOS desktop app also includes isolated multi-window browsing, the Nia AI
assistant, authenticated MCP browser control, and Nia YAML/Browser Markdown
workflows. Start with the [browser overview](./docs/browser/README.md), then see
the [security model](./docs/browser/security-model.md), [MCP tool protocol](./docs/browser/mcp-tools.md),
and [Nia/workflow formats](./docs/browser/nia-and-workflows.md).

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in the required runtime variables.
3. Treat `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `AZURE_SPEECH_KEY` as server-only secrets.
4. Keep `NEXT_PUBLIC_SUPABASE_ANON_KEY` public-facing only and rely on Supabase RLS for browser access control.
5. Run `npm run security:secrets` before committing environment-related changes.
6. Run `npm install`.
7. Run `npm run dev`.

## Planned Verification

- `npm run security:secrets`
- `npm run lint`
- `npm run test`
- `npm run playwright:test`
- `npm run build`

## Secrets And Rotation

- Public browser-safe values live in [.env.example](./.env.example).
- Non-example `.env*` files are ignored by Git and should stay local or in your deployment secret manager.
- The project documents key ownership, rotation triggers, and provider-specific handling in [docs/security/secrets-management.md](./docs/security/secrets-management.md).

## Mobile App Workflow

This project now includes a Capacitor shell for iPhone and Android while keeping the existing Next.js app as the main product surface.

### Install

```bash
npm install
```

### Native shell checks

```bash
npm run mobile:doctor
```

### Add native projects

```bash
npm run mobile:add:android
npm run mobile:add:ios
```

### Sync native projects

```bash
npm run mobile:sync
```

### Point the app shell at a running or deployed Next.js server

Set `CAPACITOR_SERVER_URL` before syncing if you want the native shell to load a real server instead of the fallback `mobile-shell` placeholder.

Examples:

```bash
$env:CAPACITOR_SERVER_URL="http://127.0.0.1:3000"
npm run mobile:sync
```

For production builds, use your deployed HTTPS application URL.
