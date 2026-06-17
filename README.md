# opencode-memory-plugin

OpenCode plugin that provides persistent memory functionality via multiple provider backends.

## Installation

```bash
npm install -g opencode-memory-plugin
npx opencode-memory-plugin init
```

Then add to your `opencode.json`:

```json
{
  "plugin": ["opencode-memory-plugin"]
}
```

Restart opencode after installing.

## Configuration

Create `~/.config/opencode-memory/config.json` with `npx opencode-memory-plugin init`, or add
`.opencode-memory.json` in your project:

```json
{
  "provider": "mem0",
  "scope": "global",
  "mem0": {
    "ollamaBaseUrl": "http://localhost:11434",
    "llmModel": "qwen2.5:7b",
    "embedModel": "nomic-embed-text"
  }
}
```

**provider**: `"mem0"` | `"honcho"` | `"openviking"` — which memory provider to use.
**scope**: `"global"` | `"project"` — whether memories are stored globally or per-project.

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
Local-only, uses Ollama for embeddings. Requires `mem0ai` peer dependency.

```bash
npm install mem0ai
```

### Honcho
Cloud-based memory. Requires `@honcho-ai/sdk` and an API key.

```bash
npm install @honcho-ai/sdk
```

### OpenViking
Server-based memory. Requires `@yfedberts/huscarl` and a running OpenViking server.

```bash
npm install @yfedberts/huscarl
```

## License

MIT
