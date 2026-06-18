import type { ToolContext } from "@opencode-ai/plugin";
import type { MemoryCategory, MemoryProvider, MemoryResult, MemoryScope } from "../src/types.js";

export function createToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionID: "session-1",
    messageID: "message-1",
    agent: "test-agent",
    directory: process.cwd(),
    worktree: process.cwd(),
    abort: new AbortController().signal,
    metadata() {},
    async ask() {},
    ...overrides,
  };
}

export function createMemoryResult(input: {
  id: string;
  content: string;
  category?: MemoryCategory;
  scope?: MemoryScope;
  relevance?: number;
  tags?: string[];
}): MemoryResult {
  return {
    id: input.id,
    content: input.content,
    metadata: {
      category: input.category ?? "conversation",
      scope: input.scope ?? "global",
      ...(input.tags ? { tags: input.tags } : {}),
    },
    ...(input.relevance == null ? {} : { relevance: input.relevance }),
  };
}

export function createMockProvider(overrides: Partial<MemoryProvider> = {}): MemoryProvider {
  return {
    add: async () => ({ id: "memory-1" }),
    search: async () => [],
    delete: async () => {},
    list: async () => [],
    summarize: async () => "",
    ...overrides,
  };
}
