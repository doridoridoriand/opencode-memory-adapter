declare module "mem0ai" {
  export interface MemoryConfig {
    host?: string;
    model?: {
      llm?: { provider: string; model: string };
      embedder?: { provider: string; model: string };
    };
  }
  class Memory {
    constructor(config: MemoryConfig);
    add(
      events: { role: string; content: string }[],
      options?: { metadata?: Record<string, unknown> }
    ): Promise<unknown>;
    search(query: string, limit?: number, options?: Record<string, unknown>): Promise<unknown[]>;
    delete(id: string): Promise<void>;
    get_all(): Promise<unknown[]>;
  }
  export { Memory };
  export default Memory;
}
