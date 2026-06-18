import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryProvider } from "../src/types.js";
import { setConfig, setProvider } from "../src/memory-singleton.js";
import { memoryStore } from "../src/tools/memory-store.js";
import { memoryRecall } from "../src/tools/memory-recall.js";
import { memoryList } from "../src/tools/memory-list.js";
import { memoryDelete } from "../src/tools/memory-delete.js";
import { memorySummary } from "../src/tools/memory-summary.js";
import { createMemoryResult, createToolContext } from "./test-helpers.js";

function asProvider(overrides: Partial<MemoryProvider>): MemoryProvider {
  return {
    add: async () => ({ id: "memory-1" }),
    search: async () => [],
    delete: async () => {},
    list: async () => [],
    ...overrides,
  };
}

const context = createToolContext();

describe("memory tools", () => {
  beforeEach(() => {
    setConfig({ provider: "mem0", scope: "project" });
  });

  it("stores memories using the configured default scope", async () => {
    const add = vi.fn().mockResolvedValue({ id: "memory-1" });
    setProvider(
      asProvider({
        add,
      })
    );

    const output = await memoryStore.execute(
      {
        content: "Remember this decision",
        category: "decision",
      },
      context
    );

    expect(add).toHaveBeenCalledWith("Remember this decision", {
      category: "decision",
      tags: undefined,
      scope: "project",
    });
    expect(output).toContain("Memory stored (memory-1)");
  });

  it("prefers an explicit scope when storing memories", async () => {
    const add = vi.fn().mockResolvedValue({ id: "memory-2" });
    setProvider(
      asProvider({
        add,
      })
    );

    await memoryStore.execute(
      {
        content: "Global preference",
        category: "preference",
        scope: "global",
        tags: ["cli"],
      },
      context
    );

    expect(add).toHaveBeenCalledWith("Global preference", {
      category: "preference",
      tags: ["cli"],
      scope: "global",
    });
  });

  it("recalls memories with default topK and formatted relevance", async () => {
    const search = vi.fn().mockResolvedValue([
      createMemoryResult({
        id: "memory-1",
        content: "Remember the release checklist",
        category: "project",
        scope: "project",
        relevance: 0.8761,
      }),
    ]);
    setProvider(
      asProvider({
        search,
      })
    );

    const output = await memoryRecall.execute(
      {
        query: "release checklist",
      },
      context
    );

    expect(search).toHaveBeenCalledWith("release checklist", {
      scope: "project",
      category: undefined,
      topK: 5,
    });
    expect(output).toContain("Found 1 memories");
    expect(output).toContain("[project] Remember the release checklist (relevance: 0.876)");
  });

  it("returns a friendly message when recall finds nothing", async () => {
    const search = vi.fn().mockResolvedValue([]);
    setProvider(
      asProvider({
        search,
      })
    );

    const output = await memoryRecall.execute(
      {
        query: "missing memory",
        topK: 3,
      },
      context
    );

    expect(search).toHaveBeenCalledWith("missing memory", {
      scope: "project",
      category: undefined,
      topK: 3,
    });
    expect(output).toContain("No memories found");
  });

  it("lists memories with a default limit and formatted ids", async () => {
    const list = vi.fn().mockResolvedValue([
      createMemoryResult({
        id: "memory-1",
        content: "Remember the roadmap",
        category: "project",
        scope: "project",
      }),
    ]);
    setProvider(
      asProvider({
        list,
      })
    );

    const output = await memoryList.execute(
      {
        category: "project",
      },
      context
    );

    expect(list).toHaveBeenCalledWith({
      scope: "project",
      category: "project",
      limit: 50,
    });
    expect(output).toContain("Listed 1 memories");
    expect(output).toContain("[memory-1] [project] Remember the roadmap");
  });

  it("returns a friendly message when list finds nothing", async () => {
    const list = vi.fn().mockResolvedValue([]);
    setProvider(
      asProvider({
        list,
      })
    );

    const output = await memoryList.execute(
      {
        scope: "global",
        limit: 2,
      },
      context
    );

    expect(list).toHaveBeenCalledWith({
      scope: "global",
      category: undefined,
      limit: 2,
    });
    expect(output).toContain("No memories found");
  });

  it("deletes memories by id", async () => {
    const deleteMemory = vi.fn().mockResolvedValue(undefined);
    setProvider(
      asProvider({
        delete: deleteMemory,
      })
    );

    const output = await memoryDelete.execute(
      {
        id: "memory-9",
      },
      context
    );

    expect(deleteMemory).toHaveBeenCalledWith("memory-9");
    expect(output).toContain("Successfully deleted memory memory-9");
  });

  it("summarizes memories when the provider supports it", async () => {
    const summarize = vi.fn().mockResolvedValue("Summary body");
    setProvider(
      asProvider({
        summarize,
      })
    );

    const output = await memorySummary.execute(
      {
        sessionId: "session-1",
      },
      context
    );

    expect(summarize).toHaveBeenCalledWith("session-1");
    expect(output).toContain("Memory summary");
    expect(output).toContain("Summary body");
  });

  it("returns fallback summary messages when the provider cannot summarize", async () => {
    const providerWithoutSummaries = asProvider({});
    delete (providerWithoutSummaries as Partial<MemoryProvider>).summarize;
    setProvider(providerWithoutSummaries);

    await expect(memorySummary.execute({}, context)).resolves.toBe(
      "summarize is not supported by the current memory provider."
    );

    const summarize = vi.fn().mockResolvedValue("");
    setProvider(
      asProvider({
        summarize,
      })
    );

    await expect(memorySummary.execute({}, context)).resolves.toBe(
      "No recent memories to summarize."
    );
  });
});
