import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BaseMemoryProvider } from "./base.js";
import { getDefaultMem0Config } from "./mem0-defaults.js";
import { normalizeMemoryMetadata } from "./metadata.js";
import type { ListOptions, Mem0Config, MemoryMetadata, MemoryResult, SearchOptions } from "../types.js";

const MEM0_AGENT_ID = "opencode-memory-adapter";

function withOpenAIV1Path(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function inferEmbeddingDimensions(model: string): number | undefined {
  const normalized = model.trim().toLowerCase();

  if (normalized.includes("nomic-embed-text")) {
    return 768;
  }

  if (normalized === "text-embedding-3-small") {
    return 1536;
  }

  return undefined;
}

function buildSearchFilters(scope?: string, category?: string): Record<string, unknown> {
  // mem0 OSS expects snake_case entity filters under config.filters.
  return Object.fromEntries(
    Object.entries({
      agent_id: MEM0_AGENT_ID,
      scope,
      category,
    }).filter(([, value]) => value != null)
  );
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

function ensurePersistentStorage(config: Required<Mem0Config>): void {
  const historyDbPath = normalizeOptionalString(config.historyDbPath);
  if (historyDbPath) {
    mkdirSync(dirname(historyDbPath), { recursive: true });
  }

  const vectorStorePath = normalizeOptionalString(config.vectorStorePath);
  if (config.vectorStoreProvider === "memory") {
    if (vectorStorePath) {
      mkdirSync(dirname(vectorStorePath), { recursive: true });
    }
    return;
  }

  if (!normalizeOptionalString(config.vectorStoreUrl)) {
    throw new Error(
      "mem0.vectorStoreUrl must be set when mem0.vectorStoreProvider is \"qdrant\". " +
        "Use mem0.vectorStoreProvider = \"memory\" for local SQLite-backed persistence."
    );
  }
}

function buildVectorStoreConfig(config: Required<Mem0Config>): Record<string, unknown> {
  if (config.vectorStoreProvider === "memory") {
    const vectorStorePath = normalizeOptionalString(config.vectorStorePath);
    return {
      provider: "memory",
      config: {
        collectionName: config.collectionName,
        ...(vectorStorePath ? { dbPath: vectorStorePath } : {}),
      },
    };
  }

  const vectorStoreUrl = normalizeOptionalString(config.vectorStoreUrl);
  const vectorStoreApiKey = normalizeOptionalString(config.vectorStoreApiKey);
  if (!vectorStoreUrl) {
    throw new Error(
      "mem0.vectorStoreUrl must be set when mem0.vectorStoreProvider is \"qdrant\". " +
        "Use mem0.vectorStoreProvider = \"memory\" for local SQLite-backed persistence."
    );
  }

  return {
    provider: "qdrant",
    config: {
      collectionName: config.collectionName,
      url: vectorStoreUrl,
      ...(vectorStoreApiKey ? { apiKey: vectorStoreApiKey } : {}),
    },
  };
}

export function buildMem0SdkConfig(config: Required<Mem0Config>): Record<string, unknown> {
  const openaiBaseUrl = withOpenAIV1Path(config.ollamaBaseUrl);
  const embeddingDims = inferEmbeddingDimensions(config.embedModel);

  return {
    embedder: {
      provider: "openai",
      config: {
        model: config.embedModel,
        baseURL: openaiBaseUrl,
        openaiBaseUrl,
        ...(embeddingDims != null ? { embeddingDims } : {}),
      },
    },
    vectorStore: buildVectorStoreConfig(config),
    llm: {
      provider: "openai",
      config: {
        model: config.llmModel,
        baseURL: openaiBaseUrl,
        openaiBaseUrl,
      },
    },
    ...(config.historyDbPath ? { historyDbPath: config.historyDbPath } : {}),
  };
}

function extractCreatedMemoryId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;

  const records = (result as { results?: unknown }).results;
  if (!Array.isArray(records) || records.length === 0) return null;

  const created = toMemoryResult(records[0] as Record<string, unknown>);
  if (!created.id || created.id.startsWith("mem0-")) {
    const raw = records[0] as Record<string, unknown>;
    if (typeof raw.id !== "string" && typeof raw.memoryId !== "string") {
      return null;
    }
  }
  return created.id;
}

export class Mem0Provider extends BaseMemoryProvider {
  private config: Required<Mem0Config>;
  private mem0: any;

  constructor(config: Mem0Config = {}) {
    super();
    this.config = { ...getDefaultMem0Config(), ...config };
  }

  private async getSdk(): Promise<any> {
    if (this.mem0) return this.mem0;

    try {
      const mod = await import("mem0ai/oss");
      const Memory = mod.Memory ?? mod.default;
      ensurePersistentStorage(this.config);
      this.mem0 = new Memory(buildMem0SdkConfig(this.config));

      return this.mem0;
    } catch (error) {
      const installHint =
        this.config.vectorStoreProvider === "qdrant"
          ? "npm install mem0ai @qdrant/js-client-rest better-sqlite3"
          : "npm install mem0ai better-sqlite3";
      throw new Error(
        `Failed to load mem0 provider. Ensure the required packages are installed: ${installHint}\n` +
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
      agentId: MEM0_AGENT_ID,
      metadata: {
        ...extra,
        category: metadata.category,
        tags: metadata.tags ?? [],
        scope: metadata.scope ?? "global",
      },
    });
    const createdId = extractCreatedMemoryId(result);
    if (!createdId) {
      throw new Error("mem0 add() succeeded without returning a memory id.");
    }
    return { id: createdId };
  }

  async search(query: string, opts: SearchOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const filters = buildSearchFilters(opts.scope, opts.category);
    const response = await sdk.search(query, {
      topK: opts.topK ?? 5,
      filters,
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
      filters,
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
    const response = await sdk.search("recent conversation summary", {
      topK: 10,
      filters: buildSearchFilters(undefined, "conversation"),
    });
    const memories: MemoryResult[] = Array.isArray(response?.results)
      ? response.results.map((memory: Record<string, unknown>) => toMemoryResult(memory))
      : [];

    return memories.map((memory) => `[${memory.metadata.category}] ${memory.content}`).join("\n");
  }
}
