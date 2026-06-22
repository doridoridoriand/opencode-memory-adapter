export type MemoryCategory = "conversation" | "project" | "preference" | "decision";

export type MemoryScope = "global" | "project";

export type MemoryProviderName = "mem0" | "honcho" | "openviking";

export interface MemoryMetadata {
  category: MemoryCategory;
  tags?: string[];
  scope?: MemoryScope;
  [key: string]: unknown;
}

export interface MemoryResult {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  relevance?: number;
}

export interface SearchOptions {
  scope?: MemoryScope;
  category?: MemoryCategory;
  topK?: number;
}

export interface ListOptions {
  scope?: MemoryScope;
  category?: MemoryCategory;
  limit?: number;
}

export interface MemoryProvider {
  add(content: string, metadata: MemoryMetadata): Promise<{ id: string }>;
  search(query: string, opts: SearchOptions): Promise<MemoryResult[]>;
  delete(id: string): Promise<void>;
  list(opts: ListOptions): Promise<MemoryResult[]>;
  summarize?(sessionId?: string): Promise<string>;
  dispose?(): Promise<void> | void;
}

export interface MemoryPluginConfig {
  provider: MemoryProviderName;
  scope?: MemoryScope;
  mem0?: Mem0Config;
  honcho?: HonchoConfig;
  openviking?: OpenVikingConfig;
}

export interface Mem0Config {
  ollamaBaseUrl?: string;
  llmModel?: string;
  embedModel?: string;
  historyDbPath?: string | null;
  vectorStoreProvider?: "memory" | "qdrant";
  vectorStorePath?: string | null;
  vectorStoreUrl?: string | null;
  vectorStoreApiKey?: string | null;
  collectionName?: string;
}

export interface HonchoConfig {
  apiKey?: string;
  baseUrl?: string;
  workspaceId?: string;
}

export interface OpenVikingConfig {
  url?: string;
  apiKey?: string;
}
