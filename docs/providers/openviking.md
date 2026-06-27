# OpenViking Setup

Use `openviking` when you want a self-hosted memory server with filesystem-style resources and semantic retrieval.

This guide assumes Node.js 22 or newer.

## What this plugin expects

- The published package to include its optional `@yfedberts/huscarl` runtime, or a manual install
  of `@yfedberts/huscarl` in the same environment where OpenCode loads the plugin.
- A reachable OpenViking server URL.
- An API key if your server requires one.

## 1. Install dependencies

```bash
npm install -g opencode-memory-adapter
npx opencode-memory-adapter init
```

`npx opencode-memory-adapter init` creates the global config file at
`~/.config/opencode-memory-adapter/config.json`. If you want a project-local
`.opencode-memory-adapter.json`, create it manually.

If your npm install omits optional dependencies, or if you need to recover from a partial install,
run:

```bash
npm install @yfedberts/huscarl
```

## 2. Start or provision an OpenViking server

Use the upstream project and client documentation as the source of truth for server bring-up:

- OpenViking project: https://github.com/OpenViking-AI/OpenViking
- Huscarl client: https://github.com/yfedberts/huscarl

This plugin only needs the final reachable server URL and, optionally, an API key. The server deployment method itself is up to your OpenViking environment.

The default local example in this repo assumes:

```text
http://localhost:1933
```

## 3. Export the API key if your server uses one

```bash
export OPENVIKING_API_KEY="your-openviking-api-key"
```

If your local server has auth disabled, you can leave the key empty.

## 4. Configure the plugin

Example config:

```json
{
  "provider": "openviking",
  "scope": "project",
  "openviking": {
    "url": "http://localhost:1933",
    "apiKey": "${OPENVIKING_API_KEY}"
  }
}
```

Notes:

- `scope: "project"` maps to the shared `opencode-memory-adapter/project/...` subtree on the server.
- `scope: "project"` does not include the current repository name or create a repo-specific namespace.
- The current provider does not expose a configurable resource root. If you need hard per-repository isolation, use a dedicated OpenViking deployment for that repository or extend the plugin.

## 5. Verify the server before starting OpenCode

The Huscarl client checks the server health endpoint during initialization. A simple preflight is:

```bash
curl http://localhost:1933/health
```

If that does not respond successfully, the plugin will not initialize.

## 6. Verify the plugin in OpenCode

After restarting OpenCode:

1. Store a memory such as: "Remember that the docs site is deployed from `main`."
2. Recall it with: "Which branch deploys the docs site?"
3. Confirm it appears in `memory-list`.
4. Delete it with `memory-delete`.
5. Use the same `scope` for all four calls during the initial test.

Implementation detail that helps when debugging:

- Each memory is written as a markdown resource under `opencode-memory-adapter/<scope>/<category>/<uuid>.md`.
- The file begins with a JSON metadata comment, followed by the memory text.
- The plugin creates directories through `/api/v1/fs/mkdir`, uploads the markdown body with WebDAV `PUT`, then waits on `/api/v1/system/wait` so a successful `memory-store` is searchable immediately.
- OpenViking may generate internal `.abstract.md` and `.overview.md` files beside your resources. The plugin ignores those helper files during `memory-list` and `memory-recall`.

If you are working inside this repository, the Kubernetes smoke test also exercises OpenViking end-to-end:

```bash
npm run test:smoke:k8s
```

That smoke test uses the existing Docker Desktop Kubernetes cluster via the
`docker-desktop` context by default.

## Common problems

### `Failed to load OpenViking provider`

Usually one of these is wrong:

- `@yfedberts/huscarl` is not installed
- `openviking.url` is wrong
- the server is down
- the API key is rejected

### Store succeeds but recall returns nothing

Check:

- `scope` matches between store and recall
- the OpenViking server finished indexing the uploaded file
- the server is actually searching the `opencode-memory-adapter/...` resource tree

This plugin adds waits on `/api/v1/system/wait`, so indexing delay should usually not be the cause. If recall still fails, inspect the uploaded resources on the server side.

### I want to inspect what was written

Look for markdown resources under:

```text
opencode-memory-adapter/global/<category>/
opencode-memory-adapter/project/<category>/
```

That layout mirrors the plugin's `scope` and `category` fields.
