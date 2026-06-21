# opencode-memory-plugin - Design Document

## Overview

OpenCode custom tools plugin that provides persistent memory functionality via multiple provider backends.

## Architecture

### Provider Abstraction Pattern

```
┌─────────────────────────────────────────┐
│         OpenCode Custom Tools           │
│  memory-store | memory-recall | ...     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Provider Factory                │
│     createProvider(config)              │
└────┬──────────┬──────────────┬──────────┘
     │          │              │
┌────▼───┐ ┌───▼─────┐ ┌─────▼────────┐
│ mem0   │ │ Honcho  │ │ OpenViking   │
└────────┘ └─────────┘ └──────────────┘
```

### Memory Provider Interface

```typescript
interface MemoryProvider {
  add(content: string, metadata: MemoryMetadata): Promise<{id: string}>
  search(query: string, opts: SearchOpts): Promise<MemoryResult[]>
  delete(id: string): Promise<void>
  list(opts: ListOpts): Promise<MemoryResult[]>
  summarize?(sessionId?: string): Promise<string>
}

interface MemoryMetadata {
  category: 'conversation' | 'project' | 'preference' | 'decision'
  tags?: string[]
  scope?: 'global' | 'project'
  [key: string]: any
}

interface MemoryResult {
  id: string
  content: string
  metadata: MemoryMetadata
  relevance?: number
}
```

### Tool Definitions

| Tool | Purpose | Args |
|---|---|---|
| `memory-store` | Save memory | content, category, tags?, scope? |
| `memory-recall` | Semantic search | query, scope?, category?, topK? |
| `memory-delete` | Delete memory | id (required: memory ID to delete) |
| `memory-list` | List memories | scope?, category?, limit? |
| `memory-summary` | Recent memory summary | auto?, sessionId? |

## Memory Providers

| Provider | npm pkg | TS SDK | API Key | Local |
|---|---|---|---|---|
| **mem0** | `mem0ai` + `@qdrant/js-client-rest` + `better-sqlite3` | ✅ | Not required | Yes (Ollama OpenAI-compatible) |
| **Honcho** | `@honcho-ai/sdk` | ✅ | Yes | No |
| **OpenViking** | `@yfedberts/huscarl` | ✅ | No | Requires OpenViking server |

### mem0 (Primary for local use)
- Uses mem0 Node SDK with OpenAI provider
- Embedding: Ollama via `openai` endpoint `http://localhost:11434/v1`
- LLM: Ollama via same endpoint
- Persistent vector store: local Qdrant on disk by default
- Local-only, no data leaves machine

### Honcho (External)
- Requires Honcho API key (`HONCHO_API_KEY`)
- Peer/session-based memory
- Data stored on Honcho servers

### OpenViking (Server-based)
- Uses huscarl TypeScript SDK (community)
- Requires OpenViking server running at `http://localhost:1933`
- Filesystem-based (`viking://`) memory paradigm

## Configuration

Global: `~/.config/opencode-memory/config.json`
Project: `.opencode-memory.json` (takes precedence)

```json
{
  "provider": "mem0",
  "scope": "global",
  "mem0": {
    "ollamaBaseUrl": "http://localhost:11434",
    "llmModel": "qwen2.5:7b",
    "embedModel": "nomic-embed-text",
    "historyDbPath": "~/.local/share/opencode-memory/mem0/history.db",
    "vectorStoreProvider": "qdrant",
    "vectorStorePath": "~/.local/share/opencode-memory/mem0/qdrant",
    "collectionName": "opencode-memory"
  },
  "honcho": {
    "apiKey": "${HONCHO_API_KEY}",
    "baseUrl": "http://localhost:8000",
    "workspaceId": "opencode"
  },
  "openviking": {
    "url": "http://localhost:1933",
    "apiKey": ""
  }
}
```

**provider**: `"mem0"` | `"honcho"` | `"openviking"` — which memory provider to use.
**scope**: `"global"` | `"project"` — whether memories are stored globally or per-project.

## Dependencies

```json
{
  "peerDependencies": {
    "@opencode-ai/plugin": ">=1.0.0",
    "mem0ai": ">=3.0.0",
    "@qdrant/js-client-rest": ">=1.18.0",
    "better-sqlite3": ">=12.6.2",
    "@honcho-ai/sdk": ">=2.0.0",
    "@yfedberts/huscarl": ">=1.0.0"
  },
  "dependencies": {
    "zod": "^4.1.8"
  },
  "peerDependenciesMeta": {
    "mem0ai": { "optional": true },
    "@qdrant/js-client-rest": { "optional": true },
    "better-sqlite3": { "optional": true },
    "@honcho-ai/sdk": { "optional": true },
    "@yfedberts/huscarl": { "optional": true }
  }
}
```

Dynamic import for lazy loading. Missing providers throw helpful error messages.

## Package Structure

```
opencode-memory-plugin/
├── LICENSE
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── config.ts
│   ├── providers/
│   │   ├── index.ts            # Factory
│   │   ├── base.ts             # Abstract base
│   │   ├── mem0-provider.ts
│   │   ├── honcho-provider.ts
│   │   └── openviking-provider.ts
│   └── tools/
│       ├── memory-store.ts
│       ├── memory-recall.ts
│       ├── memory-delete.ts
│       ├── memory-list.ts
│       └── memory-summary.ts
├── scripts/
│   └── init-config.js            # Explicit config initializer
├── test/
│   ├── config.test.ts
│   ├── honcho-provider.test.ts
│   ├── mem0-provider.test.ts
│   ├── metadata.test.ts
│   ├── openviking-provider.test.ts
│   ├── plugin.e2e.test.ts
│   ├── providers.test.ts
│   ├── test-helpers.ts
│   └── tools.test.ts
├── .github/
│   └── workflows/
│       └── ci.yml
└── dist/
```

## Install Flow

```bash
npm install -g opencode-memory-plugin
npm install mem0ai @qdrant/js-client-rest better-sqlite3
npx opencode-memory-plugin init
# Creates ~/.config/opencode-memory/config.json on demand
```

## License

MIT

## Relevant Links

- mem0: https://github.com/mem0ai/mem0ai & https://www.npmjs.com/package/mem0ai
- Honcho SDK: https://www.npmjs.com/package/@honcho-ai/sdk
- OpenViking: https://github.com/volcengine/OpenViking
- huscarl (TS SDK): https://www.npmjs.com/package/@yfedberts/huscarl
- OpenCode Tools: ~/.config/opencode/tools/
