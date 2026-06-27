import { BaseMemoryProvider } from "./base.js";
import { normalizeMemoryMetadata } from "./metadata.js";
import { getDefaultSupermemoryConfig, type ResolvedSupermemoryConfig } from "./supermemory-defaults.js";
import type {
  ListOptions,
  MemoryMetadata,
  MemoryResult,
  MemoryScope,
  SearchOptions,
  SupermemoryConfig,
} from "../types.js";

const MAX_API_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 30_000;

class SupermemoryRequestError extends Error {
  status: number;

  constructor(method: string, path: string, status: number, statusText: string, body: string) {
    super(
      `Supermemory request failed (${method} ${path}): ${status} ${statusText}${
        body ? ` - ${body}` : ""
      }`
    );
    this.name = "SupermemoryRequestError";
    this.status = status;
  }
}

interface SupermemorySearchResponse {
  results?: Array<Record<string, unknown>>;
}

interface SupermemoryCreateResponse {
  memories?: Array<Record<string, unknown>>;
}

interface SupermemoryListResponse {
  memoryEntries?: Array<Record<string, unknown>>;
  pagination?: {
    currentPage?: number;
    totalPages?: number;
  };
}

interface SupermemoryFilter {
  key?: string;
  value?: string;
  filterType?: string;
  negate?: boolean;
  AND?: SupermemoryFilter[];
  OR?: SupermemoryFilter[];
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function toMemoryResult(
  item: Record<string, unknown>,
  fallbackScope: MemoryScope
): MemoryResult | null {
  const id = typeof item.id === "string" ? item.id : null;
  const content = typeof item.memory === "string" ? item.memory : null;
  if (!id || !content) return null;

  const metadata = normalizeMemoryMetadata(
    isRecord(item.metadata) ? item.metadata : {},
    {
      scope: fallbackScope,
    }
  );

  return {
    id,
    content,
    metadata,
    relevance: typeof item.similarity === "number" ? item.similarity : undefined,
  };
}

function toRequestLimit(limit: number, needsLocalFiltering: boolean): number {
  if (!needsLocalFiltering) return Math.min(limit, MAX_API_LIMIT);
  return Math.min(Math.max(limit * 5, limit), MAX_API_LIMIT);
}

function buildMetadataFilters(category?: string): { AND: SupermemoryFilter[] } | undefined {
  if (!category) return undefined;
  return {
    AND: [{ key: "category", value: category }],
  };
}

export class SupermemoryProvider extends BaseMemoryProvider {
  private config: ResolvedSupermemoryConfig;

  constructor(config: SupermemoryConfig = {}) {
    super();
    this.config = getDefaultSupermemoryConfig(process.cwd(), config);
  }

  private getBaseUrl(): string {
    const envBaseUrl = normalizeOptionalString(
      process.env.SUPERMEMORY_API_URL ?? process.env.SUPERMEMORY_BASE_URL
    );
    return trimTrailingSlash(
      envBaseUrl ?? normalizeOptionalString(this.config.baseUrl) ?? "http://localhost:6767"
    );
  }

  private getApiKey(): string {
    const apiKey = normalizeOptionalString(
      this.config.apiKey ?? process.env.SUPERMEMORY_API_KEY
    );
    if (!apiKey) {
      throw new Error(
        "Supermemory API key is required. Set supermemory.apiKey or SUPERMEMORY_API_KEY."
      );
    }
    return apiKey;
  }

  private getContainerTag(scope?: MemoryScope): string {
    if (scope === "project") {
      return this.config.projectContainerTag;
    }
    return this.config.globalContainerTag;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.getApiKey()}`);
    if (init.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    let text: string;
    try {
      response = await fetch(`${this.getBaseUrl()}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      text = await response.text();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `Supermemory request timed out after ${REQUEST_TIMEOUT_MS}ms (${init.method ?? "GET"} ${path})`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new SupermemoryRequestError(
        init.method ?? "GET",
        path,
        response.status,
        response.statusText,
        text
      );
    }

    if (text.length === 0) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  async add(content: string, metadata: MemoryMetadata): Promise<{ id: string }> {
    const normalizedMetadata = normalizeMemoryMetadata(
      {
        ...metadata,
        scope: metadata.scope ?? "global",
        tags: metadata.tags ?? [],
      },
      {
        scope: "global",
      }
    );
    const response = await this.request<SupermemoryCreateResponse>("/v4/memories", {
      method: "POST",
      body: JSON.stringify({
        containerTag: this.getContainerTag(normalizedMetadata.scope),
        memories: [
          {
            content,
            isStatic: false,
            metadata: normalizedMetadata,
          },
        ],
      }),
    });

    const created = Array.isArray(response.memories) ? response.memories[0] : null;
    if (!isRecord(created) || typeof created.id !== "string") {
      throw new Error("Supermemory add() succeeded without returning a memory id.");
    }

    return { id: created.id };
  }

  async search(query: string, opts: SearchOptions): Promise<MemoryResult[]> {
    const scope = opts.scope ?? "global";
    const targetLimit = opts.topK ?? 5;
    const filters = buildMetadataFilters(opts.category);
    const response = await this.request<SupermemorySearchResponse>("/v4/search", {
      method: "POST",
      body: JSON.stringify({
        q: query,
        containerTag: this.getContainerTag(scope),
        threshold: this.config.similarityThreshold,
        limit: toRequestLimit(targetLimit, opts.category != null),
        searchMode: "memories",
        ...(filters ? { filters } : {}),
      }),
    });

    const memories = Array.isArray(response.results)
      ? response.results
          .map((item) => (isRecord(item) ? toMemoryResult(item, scope) : null))
          .filter((item): item is MemoryResult => item != null)
      : [];

    let filtered = this.filterByScope(memories, opts.scope);
    filtered = this.filterByCategory(filtered, opts.category);
    return this.applyLimit(filtered, targetLimit);
  }

  async delete(id: string): Promise<void> {
    const triedTags = new Set<string>();

    for (const containerTag of [
      this.config.globalContainerTag,
      this.config.projectContainerTag,
    ]) {
      if (triedTags.has(containerTag)) continue;
      triedTags.add(containerTag);

      try {
        await this.request("/v4/memories", {
          method: "DELETE",
          body: JSON.stringify({
            containerTag,
            id,
          }),
        });
        return;
      } catch (error) {
        if (error instanceof SupermemoryRequestError && error.status === 404) {
          continue;
        }
        throw error;
      }
    }

    return;
  }

  async list(opts: ListOptions): Promise<MemoryResult[]> {
    const scope = opts.scope ?? "global";
    const targetLimit = opts.limit ?? 50;
    const pageSize = toRequestLimit(targetLimit, opts.category != null);
    const memories: MemoryResult[] = [];
    let currentPage = 1;
    let totalPages = 1;

    while (currentPage <= totalPages && memories.length < targetLimit) {
      const response = await this.request<SupermemoryListResponse>("/v4/memories/list", {
        method: "POST",
        body: JSON.stringify({
          containerTags: [this.getContainerTag(scope)],
          limit: pageSize,
          page: currentPage,
          order: "desc",
          sort: "createdAt",
        }),
      });

      const entries = Array.isArray(response.memoryEntries) ? response.memoryEntries : [];
      const pageMemories = entries
        .filter((entry) => isRecord(entry) && entry.isForgotten !== true)
        .map((entry) => toMemoryResult(entry, scope))
        .filter((entry): entry is MemoryResult => entry != null);
      let filteredPage = this.filterByScope(pageMemories, opts.scope);
      filteredPage = this.filterByCategory(filteredPage, opts.category);

      memories.push(...filteredPage);

      for (const entry of entries) {
        if (!isRecord(entry)) continue;
      }

      totalPages =
        typeof response.pagination?.totalPages === "number" ? response.pagination.totalPages : 1;
      currentPage += 1;

      if (entries.length === 0) {
        break;
      }
    }

    return this.applyLimit(memories, targetLimit);
  }

  async summarize(sessionId?: string): Promise<string> {
    const results = await this.search("recent conversation summary", {
      scope: "global",
      category: "conversation",
      topK: 10,
    });
    return results.map((memory) => `[${memory.metadata.category}] ${memory.content}`).join("\n");
  }
}
