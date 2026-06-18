import { describe, expect, it, vi } from "vitest";
import { Mem0Provider } from "../src/providers/mem0-provider.js";

describe("Mem0Provider", () => {
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

    expect(sdk.getAll).toHaveBeenCalledWith({ topK: 50 });
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
          {
            id: "memory-2",
            memory: "Second summary item",
            metadata: { category: "decision", scope: "project" },
          },
        ],
      }),
    };
    const provider = new Mem0Provider();
    (provider as any).getSdk = vi.fn().mockResolvedValue(sdk);

    await provider.delete("memory-1");
    const summary = await provider.summarize();

    expect(sdk.delete).toHaveBeenCalledWith("memory-1");
    expect(sdk.search).toHaveBeenCalledWith("recent conversation summary", { topK: 10 });
    expect(summary).toBe("[conversation] First summary item\n[decision] Second summary item");
  });
});
