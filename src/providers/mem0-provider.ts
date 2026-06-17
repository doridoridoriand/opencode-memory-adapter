import { BaseMemoryProvider } from "./base.js";
import type { MemoryMetadata, MemoryResult, SearchOptions, ListOptions } from "../types.js";
import type { Mem0Config } from "../types.js";

const DEFAULT_MEM0_CONFIG: Required<Mem0Config> = {
  ollamaBaseUrl: "http://localhost:11434",
  llmModel: "qwen2.5:7b",
  embedModel: "nomic-embed-text",
  historyDbPath: null,
};

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
      const mod = await import("mem0ai");
      this.mem0 = new mod.Memory({
        host: this.config.ollamaBaseUrl,
        model: {
          llm: {
            provider: "openai",
            model: this.config.llmModel,
          },
          embedder: {
            provider: "openai",
            model: this.config.embedModel,
          },
        },
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
        category: metadata.category,
        tags: metadata.tags ?? [],
        scope: metadata.scope ?? "global",
        ...extra,
      },
    });
    return { id: (result as any).id ?? `mem0-${Date.now()}` };
  }

  async search(query: string, opts: SearchOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();

    const historyDbPath = this.config.historyDbPath;
    const results = await sdk.search(query, opts.topK ?? 5, {
      historyDbPath: historyDbPath,
    });

    const memories = results as MemoryResult[];
    let filtered = this.filterByScope(memories, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return filtered;
  }

  async delete(id: string): Promise<void> {
    const sdk = await this.getSdk();
    await sdk.delete(id);
  }

  async list(opts: ListOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const results = await sdk.get_all();
    const memories = results as MemoryResult[];
    let filtered = this.filterByScope(memories, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, opts.limit ?? 50);
  }

  async summarize(sessionId?: string): Promise<string> {
    const sdk = await this.getSdk();
    const results = await sdk.search("recent conversation summary", 10);
    const memories = results as MemoryResult[];
    return memories
      .map((m: MemoryResult) => `[${m.metadata.category}] ${m.content}`)
      .join("\n");
  }
}
