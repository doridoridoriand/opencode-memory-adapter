import { describe, expect, it, vi } from "vitest";
import { buildMem0SdkConfig, Mem0Provider } from "../src/providers/mem0-provider.js";

describe("Mem0Provider", () => {
  it("builds a persistent SQLite-backed SDK config", () => {
    expect(
      buildMem0SdkConfig({
        ollamaBaseUrl: "http://localhost:11434",
        llmModel: "qwen2.5:7b",
        embedModel: "nomic-embed-text",
        historyDbPath: "/tmp/memory-history.db",
        vectorStoreProvider: "memory",
        vectorStorePath: "/tmp/vector_store.db",
        vectorStoreUrl: null,
        vectorStoreApiKey: null,
        collectionName: "plugin-memories",
      })
    ).toEqual({
      embedder: {
        provider: "openai",
        config: {
          model: "nomic-embed-text",
          baseURL: "http://localhost:11434/v1",
          openaiBaseUrl: "http://localhost:11434/v1",
          embeddingDims: 768,
        },
      },
      vectorStore: {
        provider: "memory",
        config: {
          collectionName: "plugin-memories",
          dbPath: "/tmp/vector_store.db",
        },
      },
      llm: {
        provider: "openai",
        config: {
          model: "qwen2.5:7b",
          baseURL: "http://localhost:11434/v1",
          openaiBaseUrl: "http://localhost:11434/v1",
        },
      },
      historyDbPath: "/tmp/memory-history.db",
    });
  });

  it("builds a qdrant-backed SDK config when a server URL is provided", () => {
    expect(
      buildMem0SdkConfig({
        ollamaBaseUrl: "http://localhost:11434",
        llmModel: "qwen2.5:7b",
        embedModel: "nomic-embed-text",
        historyDbPath: "/tmp/memory-history.db",
        vectorStoreProvider: "qdrant",
        vectorStorePath: null,
        vectorStoreUrl: "http://127.0.0.1:6333",
        vectorStoreApiKey: "secret",
        collectionName: "plugin-memories",
      })
    ).toEqual({
      embedder: {
        provider: "openai",
        config: {
          model: "nomic-embed-text",
          baseURL: "http://localhost:11434/v1",
          openaiBaseUrl: "http://localhost:11434/v1",
          embeddingDims: 768,
        },
      },
      vectorStore: {
        provider: "qdrant",
        config: {
          collectionName: "plugin-memories",
          url: "http://127.0.0.1:6333",
          apiKey: "secret",
        },
      },
      llm: {
        provider: "openai",
        config: {
          model: "qwen2.5:7b",
          baseURL: "http://localhost:11434/v1",
          openaiBaseUrl: "http://localhost:11434/v1",
        },
      },
      historyDbPath: "/tmp/memory-history.db",
    });
  });

  it("requires a qdrant server URL when qdrant is selected", () => {
    expect(() =>
      buildMem0SdkConfig({
        ollamaBaseUrl: "http://localhost:11434",
        llmModel: "qwen2.5:7b",
        embedModel: "nomic-embed-text",
        historyDbPath: "/tmp/memory-history.db",
        vectorStoreProvider: "qdrant",
        vectorStorePath: "/tmp/legacy-qdrant-path",
        vectorStoreUrl: null,
        vectorStoreApiKey: null,
        collectionName: "plugin-memories",
      })
    ).toThrow('mem0.vectorStoreUrl must be set when mem0.vectorStoreProvider is "qdrant"');
  });

  it("stores memories with normalized metadata", async () => {
    const sdk = {
      add: vi.fn().mockResolvedValue({
        results: [
          {
            id: "mem0-123",
            memory: "Remember this",
            metadata: {
              category: "decision",
              scope: "project",
              tags: ["release"],
            },
          },
        ],
      }),
    };
    const provider = new Mem0Provider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);

    const result = await provider.add("Remember this", {
      category: "decision",
      scope: "project",
      tags: ["release"],
      source: "unit-test",
    });

    expect(sdk.add).toHaveBeenCalledWith(
      [{ role: "user", content: "Remember this" }],
      {
        agentId: "opencode-memory-adapter",
        metadata: {
          source: "unit-test",
          category: "decision",
          tags: ["release"],
          scope: "project",
        },
      }
    );
    expect(result).toEqual({ id: "mem0-123" });
  });

  it("fails fast when mem0 does not return a memory id", async () => {
    const sdk = {
      add: vi.fn().mockResolvedValue({
        results: [
          {
            memory: "Remember this",
            metadata: {
              category: "decision",
              scope: "project",
            },
          },
        ],
      }),
    };
    const provider = new Mem0Provider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);

    await expect(
      provider.add("Remember this", {
        category: "decision",
        scope: "project",
      })
    ).rejects.toThrow("mem0 add() succeeded without returning a memory id");
  });

  it("filters search results after the SDK response", async () => {
    const sdk = {
      search: vi.fn().mockResolvedValue({
        results: [
          {
            id: "keep-1",
            memory: "Keep this project memory",
            score: 0.91,
            metadata: { category: "project", scope: "project" },
          },
          {
            id: "drop-scope",
            text: "Wrong scope",
            metadata: { category: "project", scope: "global" },
          },
          {
            memoryId: "drop-category",
            text: "Wrong category",
            metadata: { category: "decision", scope: "project" },
          },
        ],
      }),
    };
    const provider = new Mem0Provider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);

    const results = await provider.search("project", {
      scope: "project",
      category: "project",
      topK: 2,
    });

    expect(sdk.search).toHaveBeenCalledWith("project", {
      topK: 2,
      filters: {
        agent_id: "opencode-memory-adapter",
        scope: "project",
        category: "project",
      },
    });
    expect(results).toEqual([
      {
        id: "keep-1",
        content: "Keep this project memory",
        metadata: {
          category: "project",
          scope: "project",
        },
        relevance: 0.91,
      },
    ]);
  });

  it("lists memories without SDK filters when no filters are requested", async () => {
    const sdk = {
      getAll: vi.fn().mockResolvedValue({
        results: [
          {
            memoryId: "memory-1",
            text: "Default metadata memory",
            metadata: {},
          },
          {
            id: "memory-2",
            memory: "Explicit metadata memory",
            metadata: {
              category: "decision",
              scope: "project",
            },
          },
        ],
      }),
    };
    const provider = new Mem0Provider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);

    const results = await provider.list({});

    expect(sdk.getAll).toHaveBeenCalledWith({
      topK: 50,
      filters: {
        agent_id: "opencode-memory-adapter",
      },
    });
    expect(results).toEqual([
      {
        id: "memory-1",
        content: "Default metadata memory",
        metadata: {
          category: "conversation",
          scope: "global",
        },
      },
      {
        id: "memory-2",
        content: "Explicit metadata memory",
        metadata: {
          category: "decision",
          scope: "project",
        },
      },
    ]);
  });

  it("deletes memories and summarizes recent results", async () => {
    const sdk = {
      delete: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({
        results: [
          {
            id: "memory-1",
            memory: "First summary item",
            metadata: { category: "conversation", scope: "global" },
          },
        ],
      }),
    };
    const provider = new Mem0Provider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);

    await provider.delete("memory-1");
    const summary = await provider.summarize();

    expect(sdk.delete).toHaveBeenCalledWith("memory-1");
    expect(sdk.search).toHaveBeenCalledWith("recent conversation summary", {
      topK: 10,
      filters: {
        agent_id: "opencode-memory-adapter",
        category: "conversation",
      },
    });
    expect(summary).toBe("[conversation] First summary item");
  });
});
