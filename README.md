# opencode-memory-adapter

OpenCode plugin that provides persistent memory functionality via multiple provider backends.

## Before You Start

- Node.js 22 or newer is required.
- OpenCode must be able to load `opencode-memory-adapter` as a plugin.
- If you plan to use the default `mem0` provider, have an OpenAI-compatible endpoint ready. Ollama is the generated default and the simplest local option.
- If you plan to use `honcho` or `openviking`, have a reachable server URL and any required API key ready.

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

If OpenCode is loading plugins from a local consumer install, run the manual install there. For
example:

```bash
cd ~/.config/opencode
npm install --no-save mem0ai better-sqlite3
```

Then generate the starter config:

```bash
npx opencode-memory-adapter init
```

`npx opencode-memory-adapter init` creates the global config file at
`~/.config/opencode-memory-adapter/config.json`. It does not create a project-local
`.opencode-memory-adapter.json`.

Then add to your `opencode.json`:

```json
{
  "plugin": [
    "opencode-memory-adapter"
  ]
}
```

If your `plugin` array already exists, append `"opencode-memory-adapter"` instead of replacing the
existing entries.

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

Use one of these config locations:

- Global config: `~/.config/opencode-memory-adapter/config.json`
- Project-local override: `.opencode-memory-adapter.json` in a repository

Behavior:

- `npx opencode-memory-adapter init` creates only the global config.
- Create `.opencode-memory-adapter.json` manually when one repository needs different settings.
- The project-local file overrides the global file.
- A project-local file can contain only the keys you want to override.

Excerpt from the generated global config:

- `npx opencode-memory-adapter init` writes `mem0`, `honcho`, and `openviking` sections.
- The snippet below shows the default `mem0` portion first, because that is the default provider.

```json
{
  "provider": "mem0",
  "scope": "global",
  "mem0": {
    "ollamaBaseUrl": "http://localhost:11434",
    "llmModel": "qwen2.5:7b",
    "embedModel": "nomic-embed-text",
    "historyDbPath": "${HOME}/.local/share/opencode-memory-adapter/mem0/history.db",
    "vectorStoreProvider": "memory",
    "vectorStorePath": "${HOME}/.local/share/opencode-memory-adapter/mem0/vector_store.db",
    "collectionName": "opencode-memory-adapter"
  }
}
```

Minimal project-local override example:

```json
{
  "provider": "mem0",
  "scope": "project"
}
```

That example only overrides the provider and default scope. Add provider-specific storage or
namespace settings when you need repository isolation.

- `provider`: `"mem0"` | `"honcho"` | `"openviking"` — which memory provider to use.
- `scope`: `"global"` | `"project"` — labels used by the plugin when storing and filtering
  memories.

`"project"` does not automatically detect the current repository or create a per-repository memory
namespace by itself.

If you need one repository isolated from another:

- `mem0`: use a project-local config with repo-specific `historyDbPath` and `vectorStorePath`, or a distinct Qdrant `collectionName`.
- `honcho`: use a distinct `workspaceId` per repository.
- `openviking`: the current provider shares one `opencode-memory-adapter/` resource root; `scope` only chooses the `global/` or `project/` subtree.

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
3. Recall it with a query like: "What did I say about the staging branch?"
4. Confirm that `memory-list` shows the stored item and `memory-delete` can remove it.
5. Use the same `scope` for store, recall, and list during the first verification pass.

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
category: "conversation" | "project" | "preference" | "decision" (optional)
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
category: "conversation" | "project" | "preference" | "decision" (optional)
limit: positive integer (optional, default: 50)
```

### memory-summary
Generate a summary of recent conversation memories.

```text
auto: boolean (optional; caller hint only, currently does not change provider behavior)
sessionId: string (optional, provider-specific hint)
```

## Providers

### mem0 (Default)
Local-only by default, uses an Ollama-compatible endpoint for both chat and embeddings, and persists
data to a local SQLite-backed vector store.
The published package normally installs the `mem0ai` and `better-sqlite3` runtimes automatically.

If you are already using another provider globally, the safest way to try `mem0` is with a
project-local `.opencode-memory-adapter.json` so you do not have to replace the global provider
config.

If you need one repository isolated from another, do not rely on `scope: "project"` alone. Use
repo-specific local database paths, or a distinct Qdrant collection if you use Qdrant.

The generated starter config uses `qwen2.5:7b` and `nomic-embed-text`, but smaller local models
such as `qwen2.5:3b` and `qwen3-embedding:0.6b` also work if those are the ones you already have
in Ollama.

Config values support `${...}` environment-variable interpolation. Use `${HOME}/...` or another
absolute path for SQLite files; a literal `~` is not expanded.

mem0 may normalize or rewrite stored memories into a more canonical sentence. Recall and list
results therefore do not always echo the original text verbatim.

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

For repository isolation, use a distinct `workspaceId` per repository. `scope: "project"` only
labels memories inside the chosen Honcho workspace.

Full guide: [docs/providers/honcho.md](./docs/providers/honcho.md)

### OpenViking
Server-based memory. The published package normally installs `@yfedberts/huscarl`
automatically; you only need a running OpenViking server and, if enabled on your deployment,
an API key. The provider writes resources through OpenViking's filesystem and WebDAV endpoints,
then waits for indexing before returning from `memory-store`.

`scope: "project"` maps to the shared `opencode-memory-adapter/project/...` subtree. The current
provider does not have a repo-specific namespace setting.

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
