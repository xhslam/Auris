# Secrets Management

## Classification

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are browser-safe configuration values. They can ship to the client, but they still need least-privilege Supabase RLS policies behind them.
- `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `AZURE_SPEECH_KEY` are secrets. They must stay in server-only runtimes and never be committed.
- `AZURE_SPEECH_REGION` is not a secret, but it is still deployment configuration and should stay in environment management with the related key.
- `SHADOWING_VOXCPM_URL` and `SHADOWING_VOXCPM_MODEL_VERSION` are internal runtime configuration. Treat them as environment-managed values rather than source-controlled constants.

## Storage Rules

1. Keep real values in local `.env.local` files or your deployment secret manager.
2. Only commit `.env.example`, never commit populated `.env*` files.
3. Run `npm run security:secrets` before opening a PR or merging environment-related changes.
4. Do not paste keys into screenshots, issue comments, or debug logs.

## Rotation Triggers

Rotate server-side keys immediately when any of these happens:

1. A key is committed, pasted into chat, or exposed in logs.
2. A laptop, CI token, or deployment environment is suspected compromised.
3. A teammate with access leaves the project or changes responsibility.
4. Quarterly housekeeping comes due for long-lived production keys.

## Rotation Playbook

1. Inventory which variables are affected and where they are used.
2. Generate a replacement key in the provider console before revoking the old one.
3. Update local development secrets and deployed runtime secrets.
4. Run targeted smoke checks:
   `npm run security:secrets`, `npm run test`, and the relevant API flow.
5. Revoke or delete the old key once the replacement is live.
6. Record the rotation date, owner, and affected environments in your team notes.

## Provider Notes

- OpenAI: rotate `OPENAI_API_KEY` if it appears in code, logs, CI output, or third-party tools.
- Azure Speech: rotate `AZURE_SPEECH_KEY` together with any environment using the same Speech resource.
- Supabase: treat `SUPABASE_SERVICE_ROLE_KEY` as highly privileged and server-only. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is expected to be public, so the real protection is RLS plus avoiding privileged operations in browser code.
