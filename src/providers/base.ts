import type { MemoryProvider, MemoryMetadata, MemoryResult, SearchOptions, ListOptions } from "../types.js";

export abstract class BaseMemoryProvider implements MemoryProvider {
  abstract add(content: string, metadata: MemoryMetadata): Promise<{ id: string }>;
  abstract search(query: string, opts: SearchOptions): Promise<MemoryResult[]>;
  abstract delete(id: string): Promise<void>;
  abstract list(opts: ListOptions): Promise<MemoryResult[]>;
  abstract summarize?(sessionId?: string): Promise<string>;

  protected filterByScope(results: MemoryResult[], scope?: string): MemoryResult[] {
    if (!scope) return results;
    return results.filter((r) => r.metadata.scope === scope);
  }

  protected filterByCategory(results: MemoryResult[], category?: string): MemoryResult[] {
    if (!category) return results;
    return results.filter((r) => r.metadata.category === category);
  }

  protected applyLimit(results: MemoryResult[], limit?: number): MemoryResult[] {
    if (limit == null) return results;
    return results.slice(0, limit);
  }
}
