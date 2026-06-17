import { BaseMemoryProvider } from "./base.js";
import type { MemoryMetadata, MemoryResult, SearchOptions, ListOptions } from "../types.js";
import type { OpenVikingConfig } from "../types.js";

export class OpenVikingProvider extends BaseMemoryProvider {
  private config: OpenVikingConfig;
  private sdk: any;

  constructor(config: OpenVikingConfig = {}) {
    super();
    this.config = config;
  }

  private async getSdk(): Promise<any> {
    if (this.sdk) return this.sdk;
    try {
      const huscarl = await import("@yfedberts/huscarl");
      const config = {
        url: this.config.url ?? "http://localhost:1933",
        apiKey: this.config.apiKey,
      };
      const client = huscarl.default.initClient(undefined, config);
      this.sdk = client;
      return this.sdk;
    } catch (error) {
      throw new Error(
        `Failed to load OpenViking provider. Ensure @yfedberts/huscarl is installed and OpenViking server is running.\n` +
          `Underlying error: ${(error as Error).message}`
      );
    }
  }

  async add(content: string, metadata: MemoryMetadata): Promise<{ id: string }> {
    const sdk = await this.getSdk();
    const tag = metadata.category ?? "general";
    const result = await sdk.createDocWithContent("memory", { content }, { tag });
    return { id: (result as any).id ?? `openviking-${Date.now()}` };
  }

  async search(query: string, opts: SearchOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const results = await sdk.search(query);

    const memories: MemoryResult[] = (results as any[]).map((r: any) => ({
      id: r.id,
      content: r.content,
      metadata: {
        category: r.tags?.[0] ?? "conversation",
        scope: r.tags?.includes("project") ? "project" : "global",
      },
      relevance: r.score,
    }));

    let filtered = this.filterByScope(memories, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, opts.topK ?? 5);
  }

  async delete(id: string): Promise<void> {
    const sdk = await this.getSdk();
    await sdk.deleteDoc(id);
  }

  async list(opts: ListOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const results = await sdk.getDocs();

    const memories: MemoryResult[] = (results as any[]).map((r: any) => ({
      id: r.id,
      content: r.content,
      metadata: {
        category: r.tags?.[0] ?? "conversation",
        scope: r.tags?.includes("project") ? "project" : "global",
      },
    }));

    let filtered = this.filterByScope(memories, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, opts.limit ?? 50);
  }

  async summarize(sessionId?: string): Promise<string> {
    const sdk = await this.getSdk();
    const results = await sdk.search("recent conversation summary", 10);

    const memories: MemoryResult[] = (results as any[]).map((r: any) => ({
      id: r.id,
      content: r.content,
      metadata: {
        category: r.tags?.[0] ?? "conversation",
        scope: r.tags?.includes("project") ? "project" : "global",
      },
    }));

    return memories.map((m) => `[${m.metadata.category}] ${m.content}`).join("\n");
  }
}
