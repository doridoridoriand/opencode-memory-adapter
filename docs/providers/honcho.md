# Honcho Setup

Use `honcho` when you want a managed memory backend or you already run a Honcho deployment.

## What this plugin expects

- The published package to include its optional `@honcho-ai/sdk` runtime, or a manual install of
  `@honcho-ai/sdk` in the same environment where OpenCode loads the plugin.
- A Honcho API key for managed Honcho, or for self-hosted deployments that enforce API-key auth.
- A Honcho base URL.
- A `workspaceId` to isolate one memory pool from another.

## 1. Install dependencies

```bash
npm install -g opencode-memory-adapter
npx opencode-memory-adapter init
```

If your npm install omits optional dependencies, or if you need to recover from a partial install,
run:

```bash
npm install @honcho-ai/sdk
```

## 2. Get a Honcho API key if your deployment requires one

Use the current Honcho docs and dashboard:

- Honcho site: https://honcho.dev/
- Honcho repository: https://github.com/plastic-labs/honcho

For most users, the managed cloud endpoint is the easiest starting point. If you run Honcho
yourself, your deployment may not require an API key at all.

## 3. Export your API key when needed

```bash
export HONCHO_API_KEY="your-honcho-api-key"
```

If your self-hosted Honcho deployment does not require API-key auth, you can skip this step.

The plugin config supports environment interpolation, so `${HONCHO_API_KEY}` is resolved when the
config is loaded.

## 4. Configure the plugin

Recommended managed-cloud config:

```json
{
  "provider": "honcho",
  "scope": "project",
  "honcho": {
    "apiKey": "${HONCHO_API_KEY}",
    "baseUrl": "https://api.honcho.dev",
    "workspaceId": "my-project-memory"
  }
}
```

Notes:

- `workspaceId` is the top-level memory namespace inside Honcho.
- Reuse the same `workspaceId` across projects only if you intentionally want shared memory.
- `scope` still matters inside the plugin and is applied on top of the provider.

If you run your own Honcho deployment, replace `baseUrl` with your server URL.

Example self-hosted config without an API key:

```json
{
  "provider": "honcho",
  "scope": "project",
  "honcho": {
    "baseUrl": "http://localhost:8000",
    "workspaceId": "my-project-memory"
  }
}
```

## 5. Verify the plugin in OpenCode

After restarting OpenCode:

1. Store a memory such as: "Remember that release approvals go through Dana."
2. Recall it with: "Who approves releases?"
3. Confirm it appears in `memory-list`.
4. Delete it with `memory-delete`.

Implementation detail that helps when debugging:

- Each `memory-store` call becomes a Honcho session with one stored message.

If you are working inside this repository, the Kubernetes smoke test also exercises Honcho end-to-end:

```bash
npm run test:smoke:k8s
```

That smoke test uses the existing Docker Desktop Kubernetes cluster via the
`docker-desktop` context by default.

## Common problems

### `401` or `403` errors

Usually one of these is wrong:

- `HONCHO_API_KEY`
- `baseUrl`
- permissions for the chosen workspace/account

If you self-host Honcho without API-key auth, confirm that the server is actually configured to
allow unauthenticated access before assuming the plugin is at fault.

### Memories are missing after a restart

Check that you restarted OpenCode after editing the config, and confirm you are still using the same:

- `provider`
- `workspaceId`
- `scope`

Changing any of those can make the new session look empty even though older data still exists elsewhere.

### I want separate memory per repository

Use either:

- a distinct `workspaceId` per repository, or
- one shared `workspaceId` plus `scope: "project"`

The stricter separation is a unique `workspaceId` per repository.

### I run Honcho locally

Set `baseUrl` to your local server, for example `http://localhost:8000`, and keep the rest of the config the same.
