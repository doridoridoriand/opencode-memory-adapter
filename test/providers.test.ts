import { describe, it, expect, vi } from "vitest";
import { Mem0Provider } from "../src/providers/mem0-provider.js";
import { HonchoProvider } from "../src/providers/honcho-provider.js";
import { OpenVikingProvider } from "../src/providers/openviking-provider.js";
import { SupermemoryProvider } from "../src/providers/supermemory-provider.js";
import { createProvider } from "../src/providers/index.js";
import { getDefaultMem0Config } from "../src/providers/mem0-defaults.js";
import { buildMem0SdkConfig } from "../src/providers/mem0-provider.js";
import { normalizeMemoryMetadata } from "../src/providers/metadata.js";
import { resolveScope } from "../src/tools/shared.js";

describe("createProvider", () => {
  it("creates mem0 provider by default", () => {
    const provider = createProvider({ provider: "mem0" });
    expect(provider).toBeDefined();
    expect(provider.constructor.name).toBe("Mem0Provider");
  });

  it("creates honcho provider", () => {
    const provider = createProvider({ provider: "honcho", honcho: { apiKey: "test" } });
    expect(provider).toBeDefined();
    expect(provider.constructor.name).toBe("HonchoProvider");
  });

  it("creates openviking provider", () => {
    const provider = createProvider({ provider: "openviking", openviking: {} });
    expect(provider).toBeDefined();
    expect(provider.constructor.name).toBe("OpenVikingProvider");
  });

  it("creates supermemory provider", () => {
    const provider = createProvider({ provider: "supermemory", supermemory: {} });
    expect(provider).toBeDefined();
    expect(provider.constructor.name).toBe("SupermemoryProvider");
  });

  it("throws on unknown provider", () => {
    expect(() => createProvider({ provider: "unknown" as any })).toThrow("Unknown memory provider");
  });
});

describe("BaseMemoryProvider helpers", () => {
  it("filters by scope", () => {
    const p = new Mem0Provider();
    const results = [
      { id: "1", content: "a", metadata: { category: "conversation" as const, scope: "global" as const } },
      { id: "2", content: "b", metadata: { category: "conversation" as const, scope: "project" as const } },
    ];
    const filtered = p["filterByScope"](results, "global");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");
  });

  it("filters by category", () => {
    const p = new Mem0Provider();
    const results = [
      { id: "1", content: "a", metadata: { category: "conversation" as const } },
      { id: "2", content: "b", metadata: { category: "decision" as const } },
    ];
    const filtered = p["filterByCategory"](results, "conversation");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");
  });

  it("applies limit", () => {
    const p = new Mem0Provider();
    const results = [
      { id: "1", content: "a", metadata: { category: "conversation" as const } },
      { id: "2", content: "b", metadata: { category: "conversation" as const } },
      { id: "3", content: "c", metadata: { category: "conversation" as const } },
    ];
    const limited = p["applyLimit"](results, 2);
    expect(limited).toHaveLength(2);
  });
});

describe("normalizeMemoryMetadata", () => {
  it("fills in defaults for missing category and scope", () => {
    expect(normalizeMemoryMetadata({ tags: ["a"] })).toEqual({
      category: "conversation",
      scope: "global",
      tags: ["a"],
    });
  });

  it("keeps valid category and scope values", () => {
    expect(
      normalizeMemoryMetadata({
        category: "decision",
        scope: "project",
        tags: ["memory"],
        source: "test",
      })
    ).toEqual({
      category: "decision",
      scope: "project",
      tags: ["memory"],
      source: "test",
    });
  });
});

describe("runtime config", () => {
  it("builds a persistent mem0 SDK config by default", () => {
    expect(buildMem0SdkConfig(getDefaultMem0Config())).toEqual({
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
          collectionName: "opencode-memory-adapter",
          dimension: 768,
          dbPath: expect.stringContaining("/opencode-memory-adapter/mem0/vector_store.db"),
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
      historyDbPath: expect.stringContaining("/opencode-memory-adapter/mem0/history.db"),
    });
  });

  it("builds a qdrant SDK config when an explicit server URL is configured", () => {
    expect(
      buildMem0SdkConfig({
        ...getDefaultMem0Config(),
        vectorStoreProvider: "qdrant",
        vectorStoreUrl: "http://127.0.0.1:6333",
        vectorStoreApiKey: "secret",
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
          collectionName: "opencode-memory-adapter",
          dimension: 768,
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
      historyDbPath: expect.stringContaining("/opencode-memory-adapter/mem0/history.db"),
    });
  });

  it("falls back to global scope when config omits scope", () => {
    expect(resolveScope({ provider: "mem0" }, undefined)).toBe("global");
  });

  it("prefers an explicit scope over config", () => {
    expect(resolveScope({ provider: "mem0", scope: "global" }, "project")).toBe("project");
  });
});
