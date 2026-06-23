# opencode-memory-adapter

OpenCode plugin that provides persistent memory functionality via multiple provider backends.

## Installation

```bash
npm install -g opencode-memory-adapter
```

The published package includes provider runtime SDKs as optional dependencies, so a normal install
does not require separate provider-specific `npm install` commands.

If your environment omits optional dependencies or an optional native build fails, install the
provider runtime manually in the same environment where OpenCode loads the plugin:

```bash
# mem0 (local-first, default fallback)
npm install mem0ai better-sqlite3

# Honcho (managed or self-hosted fallback)
npm install @honcho-ai/sdk

# OpenViking (self-hosted server fallback)
npm install @yfedberts/huscarl
```

Then generate the starter config:

```bash
npx opencode-memory-adapter init
```

Then add to your `opencode.json`:

```json
{
  "plugin": ["opencode-memory-adapter"]
}
```

Restart opencode after installing.

## Publishing

This repository includes `.github/workflows/publish.yml` for npm publication, but the workflow is
currently disabled. At the moment, publishing is performed only from the author's local machine.

Recommended setup:

1. Bump `package.json` to the release version on `main`.
2. Run `npm publish` from the author's local machine after authenticating to npm.
3. Revoke any temporary automation token immediately after publishing.

Before publishing locally, run `scan:sensitive`, `audit:package`, `build`, `test:unit`, and
`test:e2e`.

## Configuration

Create `~/.config/opencode-memory-adapter/config.json` with `npx opencode-memory-adapter init`, or add
`.opencode-memory-adapter.json` in your project:

```json
{
  "provider": "mem0",
  "scope": "global",
  "mem0": {
    "ollamaBaseUrl": "http://localhost:11434",
    "llmModel": "qwen2.5:7b",
    "embedModel": "nomic-embed-text",
    "historyDbPath": "~/.local/share/opencode-memory-adapter/mem0/history.db",
    "vectorStoreProvider": "memory",
    "vectorStorePath": "~/.local/share/opencode-memory-adapter/mem0/vector_store.db",
    "collectionName": "opencode-memory-adapter"
  }
}
```

**provider**: `"mem0"` | `"honcho"` | `"openviking"` — which memory provider to use.
**scope**: `"global"` | `"project"` — whether memories are stored globally or per-project.

## Setup Guides

If you want step-by-step setup instructions, use the provider guides:

- [Provider setup overview](./docs/providers/README.md)
- [mem0 setup](./docs/providers/mem0.md)
- [Honcho setup](./docs/providers/honcho.md)
- [OpenViking setup](./docs/providers/openviking.md)

For most users:

- Choose `mem0` if you want the simplest local setup and are already comfortable running Ollama.
- Choose `honcho` if you want managed memory with the least infrastructure to operate yourself.
- Choose `openviking` if you already run OpenViking or want a self-hosted server with a filesystem-style resource model.

## Quick Verification

After changing the config:

1. Restart OpenCode so it reloads the plugin and provider config.
2. Store a test memory, for example: "Remember that the staging branch deploys to us-west-2."
3. Immediately recall it with a query like: "What did I say about the staging branch?"
4. Confirm that `memory-list` shows the stored item and `memory-delete` can remove it.

If the provider-specific setup is correct, store and recall should work in the same session without any extra migration step.

## Behavior

This plugin adds memory tools only. Installing it does not make OpenCode automatically store,
recall, or summarize memories.

If you want proactive memory usage, add explicit agent instructions in your repository or team
prompting conventions, for example through `AGENTS.md`.

## Available Tools

Primary tool identifiers use hyphenated names. Snake_case aliases are also exported for compatibility.

### memory-store
Save a memory entry with content and metadata.

```
content: string (required)
category: "conversation" | "project" | "preference" | "decision" (required)
tags: string[] (optional)
scope: "global" | "project" (optional)
```

### memory-recall
Semantically search stored memories.

```
query: string (required)
scope: "global" | "project" (optional)
category: string (optional)
topK: positive integer (optional, default: 5)
```

### memory-delete
Delete a memory entry by ID.

```
id: string (required)
```

### memory-list
List stored memories with optional filtering.

```
scope: "global" | "project" (optional)
category: string (optional)
limit: positive integer (optional, default: 50)
```

### memory-summary
Generate a summary of recent conversation memories.

```
auto: boolean (optional)
sessionId: string (optional, provider-specific hint)
```

## Providers

### mem0 (Default)
Local-only by default, uses Ollama for embeddings and persists data to a local SQLite-backed vector store.
The published package normally installs the `mem0ai` and `better-sqlite3` runtimes automatically.

If you want Qdrant instead, point `mem0.vectorStoreUrl` at a running Qdrant server. The published
package also includes the Qdrant client runtime as an optional dependency.

Example:

```json
{
  "provider": "mem0",
  "mem0": {
    "vectorStoreProvider": "qdrant",
    "vectorStoreUrl": "http://127.0.0.1:6333",
    "collectionName": "opencode-memory-adapter"
  }
}
```

Full guide: [docs/providers/mem0.md](./docs/providers/mem0.md)

### Honcho
Cloud-based or self-hosted memory. The published package normally installs `@honcho-ai/sdk`
automatically. Managed Honcho requires an API key; self-hosted Honcho only needs one if your
deployment enforces API-key authentication.

Full guide: [docs/providers/honcho.md](./docs/providers/honcho.md)

### OpenViking
Server-based memory. The published package normally installs `@yfedberts/huscarl`
automatically; you only need a running OpenViking server and, if enabled on your deployment,
an API key.

Full guide: [docs/providers/openviking.md](./docs/providers/openviking.md)

## License

MIT

## Repository Development Safety

Install the versioned git hooks once per clone:

```bash
npm run hooks:install
```

Run a public-repo audit before publishing:

```bash
npm run audit:public
```

The pre-commit hook scans staged additions for common secrets, email addresses, and absolute home-directory paths.

Run the local test suite with:

```bash
npm run test:suite
npm run test:unit
npm run test:e2e
npm run test:coverage
npm run test:smoke:mem0
npm run test:smoke:k8s
```

`npm run test:smoke:k8s` uses the existing Docker Desktop Kubernetes cluster via the
`docker-desktop` context. If you need a different context name, set `KUBECTL_CONTEXT`.

GitHub Actions runs the same `build`, `test:unit`, `test:e2e`, and `test:coverage`
commands on pull requests and pushes to `main` / `feat/**`.
