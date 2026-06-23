# mem0 Setup

`mem0` is the default provider and the easiest local-first option in this plugin.

## What this plugin expects

- An OpenAI-compatible embedding + chat endpoint.
- By default, that endpoint is Ollama at `http://localhost:11434`.
- Local persistent storage on disk using `mem0ai` plus `better-sqlite3`.

Important:

- In this plugin, the default `vectorStoreProvider: "memory"` is the recommended local persistent mode.
- Despite the name, that mode is backed by a local SQLite database file, not a throwaway in-memory store.

## 1. Install dependencies

```bash
npm install -g opencode-memory-adapter
npx opencode-memory-adapter init
```

The published package normally installs `mem0ai` and `better-sqlite3` automatically as optional
runtime dependencies. If your environment omits optional dependencies, or if `better-sqlite3`
fails to build, install them manually:

```bash
npm install mem0ai better-sqlite3
```

## 2. Install and start Ollama

Install Ollama from the official download page:

- https://ollama.com/download

Then make sure the service is running. On some systems it starts automatically after install. If not:

```bash
ollama serve
```

## 3. Pull the models used by the default config

The generated config uses these defaults:

- LLM: `qwen2.5:7b`
- Embedder: `nomic-embed-text`

Pull them before testing:

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

If you change the config to use different models, pull those models instead.

## 4. Configure the plugin

Minimal local config:

```json
{
  "provider": "mem0",
  "scope": "project",
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

Notes:

- `scope: "project"` is a good default if you do not want memories from unrelated repositories mixed together.
- `ollamaBaseUrl` can omit `/v1`; the plugin adds it automatically for OpenAI-compatible clients.
- `historyDbPath` and `vectorStorePath` should point to writable paths.

## 5. Verify Ollama before starting OpenCode

You should be able to reach the local Ollama server:

```bash
curl http://localhost:11434/api/tags
```

If that fails, the plugin will fail too.

## 6. Verify the plugin in OpenCode

After restarting OpenCode:

1. Store a memory such as: "Remember that staging uses the blue database."
2. Recall it with: "What did I say about staging?"
3. Confirm it appears in `memory-list`.
4. Delete it with `memory-delete`.

If you are working inside this repository, you can also run the packaged smoke test:

```bash
npm run test:smoke:mem0
```

## Optional: use Qdrant instead of the local SQLite vector store

If you already run a Qdrant server, configure `mem0` like this:

```json
{
  "provider": "mem0",
  "mem0": {
    "ollamaBaseUrl": "http://localhost:11434",
    "llmModel": "qwen2.5:7b",
    "embedModel": "nomic-embed-text",
    "historyDbPath": "~/.local/share/opencode-memory-adapter/mem0/history.db",
    "vectorStoreProvider": "qdrant",
    "vectorStoreUrl": "http://127.0.0.1:6333",
    "collectionName": "opencode-memory-adapter"
  }
}
```

If your environment omitted optional dependencies, install the full Qdrant-capable runtime set manually:

```bash
npm install mem0ai @qdrant/js-client-rest better-sqlite3
```

Use Qdrant only when you intentionally want a running external vector database. For simple local use, stick with the default SQLite-backed mode.

## Common problems

### `connect ECONNREFUSED 127.0.0.1:11434`

Ollama is not running, or `ollamaBaseUrl` is wrong.

### `model not found`

You installed Ollama but did not pull the models configured in `llmModel` and `embedModel`.

### `better-sqlite3` load error

The optional dependency is missing or failed to build for your Node/runtime environment. Reinstall
`better-sqlite3` in the same environment where OpenCode loads the plugin.

### Store works but nothing is recalled

Check that:

- the same config file is being loaded after restart,
- your `scope` matches between store and recall,
- the Ollama embed model is reachable,
- the vector store path is writable.
