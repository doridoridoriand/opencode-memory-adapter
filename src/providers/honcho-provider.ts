import { BaseMemoryProvider } from "./base.js";
import type { MemoryMetadata, MemoryResult, SearchOptions, ListOptions } from "../types.js";
import type { HonchoConfig } from "../types.js";

export class HonchoProvider extends BaseMemoryProvider {
  private config: HonchoConfig;
  private sdk: any;

  constructor(config: HonchoConfig = {}) {
    super();
    this.config = config;
  }

  private async getSdk(): Promise<any> {
    if (this.sdk) return this.sdk;
    try {
      const Honcho = await import("@honcho-ai/sdk");
      const honcho = new Honcho.default({
        apiKey: this.config.apiKey ?? process.env.HONCHO_API_KEY,
        baseURL: this.config.baseUrl,
      });
      this.sdk = honcho;
      return this.sdk;
    } catch (error) {
      throw new Error(
        `Failed to load Honcho provider. Ensure @honcho-ai/sdk is installed: npm install @honcho-ai/sdk\n` +
          `Underlying error: ${(error as Error).message}`
      );
    }
  }

  async add(content: string, metadata: MemoryMetadata): Promise<{ id: string }> {
    const sdk = await this.getSdk();
    const workspaceId = this.config.workspaceId ?? "opencode";
    const result = await sdk.chats.createChat({
      workspaceId,
      messages: [{ role: "user", content }],
      customId: metadata.tags?.[0],
    });
    return { id: (result as any).id ?? `honcho-${Date.now()}` };
  }

  async search(query: string, opts: SearchOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const workspaceId = this.config.workspaceId ?? "opencode";
    const result = await sdk.chats.retrieveChats({
      workspaceId,
      limit: opts.topK ?? 5,
    });

    const chats: MemoryResult[] = result.map((chat: any) => ({
      id: chat.id,
      content: chat.messages?.[0]?.content ?? chat.customId ?? "",
      metadata: { category: opts.category ?? "conversation", scope: opts.scope ?? "global" },
    }));

    let filtered = this.filterByScope(chats, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, opts.topK);
  }

  async delete(id: string): Promise<void> {
    const sdk = await this.getSdk();
    const workspaceId = this.config.workspaceId ?? "opencode";
    await sdk.chats.deleteChat(workspaceId, id);
  }

  async list(opts: ListOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const workspaceId = this.config.workspaceId ?? "opencode";
    const result = await sdk.chats.retrieveChats({
      workspaceId,
      limit: opts.limit ?? 50,
    });

    const chats = result.map((chat: any) => ({
      id: chat.id,
      content: chat.messages?.[0]?.content ?? chat.customId ?? "",
      metadata: { category: "conversation", scope: "global" },
    })) as MemoryResult[];

    let filtered = this.filterByScope(chats, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, opts.limit ?? 50);
  }

  async summarize(sessionId?: string): Promise<string> {
    const results = await this.search("recent conversation summary", { topK: 10 });
    return results
      .map((m) => `[${m.metadata.category}] ${m.content}`)
      .join("\n");
  }
}
