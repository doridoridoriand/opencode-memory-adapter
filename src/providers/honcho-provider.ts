import { randomUUID } from "node:crypto";
import { BaseMemoryProvider } from "./base.js";
import { normalizeMemoryMetadata } from "./metadata.js";
import type { HonchoConfig, ListOptions, MemoryMetadata, MemoryResult, SearchOptions } from "../types.js";

const HONCHO_PEER_ID = "opencode-memory-adapter";
const HONCHO_LIST_CONCURRENCY = 5;

function buildMetadata(metadata: MemoryMetadata): MemoryMetadata {
  return normalizeMemoryMetadata({
    ...metadata,
    tags: metadata.tags ?? [],
    scope: metadata.scope ?? "global",
  });
}

function toMemoryResult(message: Record<string, unknown>): MemoryResult {
  const metadata = normalizeMemoryMetadata(
    typeof message.metadata === "object" && message.metadata != null
      ? (message.metadata as Record<string, unknown>)
      : {}
  );

  return {
    id:
      (typeof message.sessionId === "string" && message.sessionId) ||
      (typeof message.id === "string" && message.id) ||
      `honcho-${randomUUID()}`,
    content: typeof message.content === "string" ? message.content : "",
    metadata,
  };
}

function buildSearchFilters(scope?: string, category?: string): Record<string, unknown> | undefined {
  const filters = Object.fromEntries(
    Object.entries({ scope, category }).filter(([, value]) => value != null)
  );
  return Object.keys(filters).length > 0 ? filters : undefined;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = [];

  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    results.push(...(await Promise.all(chunk.map(mapper))));
  }

  return results;
}

export class HonchoProvider extends BaseMemoryProvider {
  private config: HonchoConfig;
  private sdk: any;
  private peer: any;

  constructor(config: HonchoConfig = {}) {
    super();
    this.config = config;
  }

  private async getSdk(): Promise<any> {
    if (this.sdk) return this.sdk;

    try {
      const mod = await import("@honcho-ai/sdk");
      const Honcho = mod.Honcho ?? mod.default;
      this.sdk = new Honcho({
        apiKey: this.config.apiKey ?? process.env.HONCHO_API_KEY,
        baseURL: this.config.baseUrl,
        workspaceId: this.config.workspaceId ?? "opencode",
      });
      return this.sdk;
    } catch (error) {
      throw new Error(
        `Failed to load Honcho provider. Ensure @honcho-ai/sdk is installed: npm install @honcho-ai/sdk\n` +
          `Underlying error: ${(error as Error).message}`
      );
    }
  }

  private async getPeer(): Promise<any> {
    if (this.peer) return this.peer;

    const sdk = await this.getSdk();
    this.peer = await sdk.peer(HONCHO_PEER_ID, {
      metadata: { source: "opencode-memory-adapter" },
    });
    return this.peer;
  }

  async add(content: string, metadata: MemoryMetadata): Promise<{ id: string }> {
    const sdk = await this.getSdk();
    const sessionId = `memory-${randomUUID()}`;
    const normalizedMetadata = buildMetadata(metadata);
    const peer = await this.getPeer();
    const session = await sdk.session(sessionId, {
      metadata: normalizedMetadata,
    });

    await session.addPeers(peer);
    await session.addMessages(
      peer.message(content, {
        metadata: normalizedMetadata,
      })
    );

    return { id: sessionId };
  }

  async search(query: string, opts: SearchOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const limit = opts.topK ?? 5;
    const filters = buildSearchFilters(opts.scope, opts.category);
    const results = await sdk.search(query, {
      limit,
      ...(filters ? { filters } : {}),
    });

    const memories = Array.isArray(results)
      ? results.map((message: Record<string, unknown>) => toMemoryResult(message))
      : [];

    let filtered = this.filterByScope(memories, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, limit);
  }

  async delete(id: string): Promise<void> {
    const sdk = await this.getSdk();
    const session = await sdk.session(id);
    await session.delete();
  }

  async list(opts: ListOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const limit = opts.limit ?? 50;
    const filters = buildSearchFilters(opts.scope, opts.category);
    const page = await sdk.sessions({
      size: limit,
      reverse: true,
      ...(filters ? { filters } : {}),
    });
    const sessions = await page.toArray();
    const memories = (
      await mapWithConcurrency(sessions, HONCHO_LIST_CONCURRENCY, async (session: any) => {
        const messages = await session.messages({ size: 1, reverse: true });
        const message = messages.items[0];
        if (!message) return null;

        const messageMetadata =
          message.metadata && Object.keys(message.metadata).length > 0 ? message.metadata : null;
        const sessionMetadata =
          messageMetadata ||
          (session.metadata && Object.keys(session.metadata).length > 0
            ? session.metadata
            : await session.getMetadata());

        return toMemoryResult({
          ...message,
          metadata: messageMetadata ?? sessionMetadata,
          sessionId: session.id,
        });
      })
    ).filter((memory): memory is MemoryResult => memory != null);

    let filtered = this.filterByScope(memories, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, limit);
  }

  async summarize(sessionId?: string): Promise<string> {
    const results = await this.search("recent conversation summary", { topK: 10 });
    return results.map((memory) => `[${memory.metadata.category}] ${memory.content}`).join("\n");
  }
}
