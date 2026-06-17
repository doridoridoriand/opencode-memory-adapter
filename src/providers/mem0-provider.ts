import { randomUUID } from "node:crypto";
import { BaseMemoryProvider } from "./base.js";
import { normalizeMemoryMetadata } from "./metadata.js";
import type { ListOptions, Mem0Config, MemoryMetadata, MemoryResult, SearchOptions } from "../types.js";

const DEFAULT_MEM0_CONFIG: Required<Mem0Config> = {
  ollamaBaseUrl: "http://localhost:11434",
  llmModel: "qwen2.5:7b",
  embedModel: "nomic-embed-text",
  historyDbPath: null,
};

function withOpenAIV1Path(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function buildSearchFilters(scope?: string, category?: string): Record<string, unknown> | undefined {
  const filters = Object.fromEntries(
    Object.entries({ scope, category }).filter(([, value]) => value != null)
  );
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function toMemoryResult(memory: Record<string, unknown>): MemoryResult {
  const metadata = normalizeMemoryMetadata(
    typeof memory.metadata === "object" && memory.metadata != null
      ? (memory.metadata as Record<string, unknown>)
      : {}
  );

  return {
    id:
      (typeof memory.id === "string" && memory.id) ||
      (typeof memory.memoryId === "string" && memory.memoryId) ||
      `mem0-${randomUUID()}`,
    content:
      (typeof memory.memory === "string" && memory.memory) ||
      (typeof memory.text === "string" && memory.text) ||
      "",
    metadata,
    relevance: typeof memory.score === "number" ? memory.score : undefined,
  };
}

export class Mem0Provider extends BaseMemoryProvider {
  private config: Required<Mem0Config>;
  private mem0: any;

  constructor(config: Mem0Config = {}) {
    super();
    this.config = { ...DEFAULT_MEM0_CONFIG, ...config };
  }

  private async getSdk(): Promise<any> {
    if (this.mem0) return this.mem0;

    try {
      const mod = await import("mem0ai/oss");
      const Memory = mod.Memory ?? mod.default;
      const openaiBaseUrl = withOpenAIV1Path(this.config.ollamaBaseUrl);

      this.mem0 = new Memory({
        embedder: {
          provider: "openai",
          config: {
            model: this.config.embedModel,
            baseURL: openaiBaseUrl,
            openaiBaseUrl,
          },
        },
        vectorStore: {
          provider: "memory",
          config: {
            collectionName: "opencode-memory",
          },
        },
        llm: {
          provider: "openai",
          config: {
            model: this.config.llmModel,
            baseURL: openaiBaseUrl,
            openaiBaseUrl,
          },
        },
        ...(this.config.historyDbPath ? { historyDbPath: this.config.historyDbPath } : {}),
      });

      return this.mem0;
    } catch (error) {
      throw new Error(
        `Failed to load mem0 provider. Ensure mem0ai is installed: npm install mem0ai\n` +
          `Underlying error: ${(error as Error).message}`
      );
    }
  }

  async add(content: string, metadata: MemoryMetadata): Promise<{ id: string }> {
    const sdk = await this.getSdk();
    const events = [{ role: "user", content }];
    const extra = Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !["category", "tags", "scope"].includes(key))
    );
    const result = await sdk.add(events, {
      metadata: {
        ...extra,
        category: metadata.category,
        tags: metadata.tags ?? [],
        scope: metadata.scope ?? "global",
      },
    });

    const created =
      result && Array.isArray(result.results) && result.results.length > 0
        ? toMemoryResult(result.results[0] as Record<string, unknown>)
        : null;

    return { id: created?.id ?? `mem0-${randomUUID()}` };
  }

  async search(query: string, opts: SearchOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const filters = buildSearchFilters(opts.scope, opts.category);
    const response = await sdk.search(query, {
      topK: opts.topK ?? 5,
      ...(filters ? { filters } : {}),
    });

    const memories = Array.isArray(response?.results)
      ? response.results.map((memory: Record<string, unknown>) => toMemoryResult(memory))
      : [];

    let filtered = this.filterByScope(memories, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, opts.topK);
  }

  async delete(id: string): Promise<void> {
    const sdk = await this.getSdk();
    await sdk.delete(id);
  }

  async list(opts: ListOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const filters = buildSearchFilters(opts.scope, opts.category);
    const response = await sdk.getAll({
      topK: opts.limit ?? 50,
      ...(filters ? { filters } : {}),
    });

    const memories = Array.isArray(response?.results)
      ? response.results.map((memory: Record<string, unknown>) => toMemoryResult(memory))
      : [];

    let filtered = this.filterByScope(memories, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, opts.limit ?? 50);
  }

  async summarize(sessionId?: string): Promise<string> {
    const sdk = await this.getSdk();
    const response = await sdk.search("recent conversation summary", { topK: 10 });
    const memories: MemoryResult[] = Array.isArray(response?.results)
      ? response.results.map((memory: Record<string, unknown>) => toMemoryResult(memory))
      : [];

    return memories.map((memory) => `[${memory.metadata.category}] ${memory.content}`).join("\n");
  }
}
