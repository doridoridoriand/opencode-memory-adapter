declare module "@yfedberts/huscarl" {
  export interface ListEntry {
    name: string;
    uri: string;
    isDir: boolean;
    modTime: string;
  }

  export interface MatchedContext {
    uri: string;
    score: number;
  }

  export interface FindResult {
    memories: MatchedContext[];
    resources: MatchedContext[];
    skills: MatchedContext[];
    total: number;
  }

  export class Huscarl {
    constructor(config: {
      url: string;
      apiKey?: string;
      agentId?: string;
    });
    initialize(): Promise<void>;
    close(): void;
    resources: {
      add(path: string, options?: { target?: string; wait?: boolean }): Promise<{ rootUri: string }>;
      createDirectory(path: string): Promise<{ uri: string }>;
      list(path?: string, options?: { recursive?: boolean }): Promise<ListEntry[]>;
      read(path: string): Promise<string>;
      remove(path: string, options?: { recursive?: boolean }): Promise<{ uri: string }>;
    };
    retrieval: {
      find(
        query: string,
        options?: { targetUri?: string; limit?: number; scoreThreshold?: number }
      ): Promise<FindResult>;
    };
  }
}
