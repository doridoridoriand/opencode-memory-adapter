# Honcho Setup

Use `honcho` when you want a managed memory backend or you already run a Honcho deployment.

## What this plugin expects

- The `@honcho-ai/sdk` peer dependency.
- A Honcho API key.
- A Honcho base URL.
- A `workspaceId` to isolate one memory pool from another.

## 1. Install dependencies

```bash
npm install -g opencode-memory-plugin
npm install @honcho-ai/sdk
npx opencode-memory-plugin init
```

## 2. Get a Honcho API key

Use the current Honcho docs and dashboard:

- Honcho site: https://honcho.dev/
- Honcho repository: https://github.com/plastic-labs/honcho

For most users, the managed cloud endpoint is the easiest starting point.

## 3. Export your API key

```bash
export HONCHO_API_KEY="your-honcho-api-key"
```

The plugin config supports environment interpolation, so `${HONCHO_API_KEY}` is resolved when the config is loaded.

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

## Common problems

### `401` or `403` errors

Usually one of these is wrong:

- `HONCHO_API_KEY`
- `baseUrl`
- permissions for the chosen workspace/account

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
