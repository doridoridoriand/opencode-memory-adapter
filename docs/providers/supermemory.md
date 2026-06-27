# Supermemory Setup

Use `supermemory` when you want a self-hosted memory API with built-in indexing and semantic
search.

This guide assumes Node.js 22 or newer.

## What this plugin expects

- A reachable Supermemory server URL. The default in this plugin is `http://localhost:6767`.
- A Supermemory API key from that server.
- One model provider configured for the Supermemory server itself. For local-only setups, an
  OpenAI-compatible endpoint such as Ollama is enough.

This provider uses Node.js `fetch` directly, so it does not need any extra npm runtime.

## 1. Install the plugin

```bash
npm install -g opencode-memory-adapter
npx opencode-memory-adapter init
```

`npx opencode-memory-adapter init` creates the global config file at
`~/.config/opencode-memory-adapter/config.json`. If you want a project-local
`.opencode-memory-adapter.json`, create it manually.

## 2. Start Supermemory locally

Use the official self-hosting flow:

- Overview: https://supermemory.ai/docs/self-hosting/overview
- Quickstart: https://supermemory.ai/docs/self-hosting/quickstart
- Configuration: https://supermemory.ai/docs/self-hosting/configuration

Typical local install:

```bash
npx supermemory local
supermemory-server
```

The server prints its local URL and generated API key on first boot.

## 3. Point Supermemory at a model provider

For a fully local setup, configure an OpenAI-compatible endpoint such as Ollama before starting
`supermemory-server`:

```bash
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_API_KEY="ollama"
export OPENAI_MODEL="qwen2.5:3b"
```

Then start:

```bash
supermemory-server
```

Supermemory handles embeddings locally. The configured model is used for the server-side memory
pipeline.

## 4. Export the API key

```bash
export SUPERMEMORY_API_KEY="sm_your_local_api_key"
```

The plugin config supports environment interpolation, so `${SUPERMEMORY_API_KEY}` is resolved when
the config is loaded.

## 5. Configure the plugin

Example self-hosted config:

```json
{
  "provider": "supermemory",
  "scope": "project",
  "supermemory": {
    "apiKey": "${SUPERMEMORY_API_KEY}",
    "baseUrl": "http://localhost:6767",
    "similarityThreshold": 0.6
  }
}
```

Notes:

- `scope: "project"` uses a default `projectContainerTag` derived from the current worktree path.
- `scope: "global"` uses a stable machine-level `globalContainerTag`.
- You can override `globalContainerTag` or `projectContainerTag` manually if you want to share or
  rename those namespaces.
- `memory-delete` maps to Supermemory forget semantics, so the memory is soft-deleted rather than
  permanently removed.

If you use the hosted Supermemory API instead of the self-hosted binary, replace `baseUrl` with
`https://api.supermemory.ai`.

## 6. Verify the server before starting OpenCode

Once `supermemory-server` is running, a basic health check is:

```bash
curl http://localhost:6767/
```

Then verify the memory API with your bearer token, for example by storing one memory through the
plugin after restarting OpenCode.

## 7. Verify the plugin in OpenCode

After restarting OpenCode:

1. Store a memory such as: "Remember that release notes ship after QA sign-off."
2. Recall it with: "What is the release-notes rule?"
3. Confirm it appears in `memory-list`.
4. Delete it with `memory-delete`.
5. Use the same `scope` for all four calls during the initial test.

For this provider, successful `memory-delete` means the memory is forgotten and should disappear
from search and list results.

## Common problems

### `Supermemory API key is required`

Set `supermemory.apiKey` in config or export `SUPERMEMORY_API_KEY`.

### Store works but recall is empty

Check:

- `scope` matches between store and recall
- the same `projectContainerTag` is being used
- the Supermemory server is still pointing at the intended model provider

### I want one shared namespace across multiple repositories

Override `projectContainerTag` with the same explicit string in each repository's
`.opencode-memory-adapter.json`.
