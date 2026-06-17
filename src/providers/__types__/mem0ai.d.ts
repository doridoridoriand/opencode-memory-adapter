declare module "mem0ai/oss" {
  export interface MemoryRecord {
    id?: string;
    memory?: string;
    memoryId?: string;
    text?: string;
    score?: number;
    metadata?: Record<string, unknown>;
  }

  export interface SearchResult {
    results: MemoryRecord[];
  }

  export class Memory {
    constructor(config?: Record<string, unknown>);
    add(
      messages: string | { role: string; content: string }[],
      config?: Record<string, unknown>
    ): Promise<SearchResult>;
    search(query: string, config?: Record<string, unknown>): Promise<SearchResult>;
    getAll(config?: Record<string, unknown>): Promise<SearchResult>;
    delete(id: string): Promise<unknown>;
  }

  export default Memory;
}
