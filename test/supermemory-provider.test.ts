import { afterEach, describe, expect, it, vi } from "vitest";
import { SupermemoryProvider } from "../src/providers/supermemory-provider.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("SupermemoryProvider", () => {
  it("stores memories with normalized metadata in the selected container tag", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          memories: [{ id: "mem_123", memory: "Remember this" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    const provider = new SupermemoryProvider({
      apiKey: "sm-test",
      baseUrl: "http://localhost:6767",
      projectContainerTag: "project_tag",
      globalContainerTag: "global_tag",
    });

    const result = await provider.add("Remember this", {
      category: "decision",
      scope: "project",
      tags: ["release"],
      source: "unit-test",
    });

    expect(result).toEqual({ id: "mem_123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:6767/v4/memories",
      expect.objectContaining({
        method: "POST",
      })
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      containerTag: "project_tag",
      memories: [
        {
          content: "Remember this",
          isStatic: false,
          metadata: {
            category: "decision",
            scope: "project",
            source: "unit-test",
            tags: ["release"],
          },
        },
      ],
    });
  });

  it("searches memory entries and filters by category locally", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "mem_1",
              memory: "Keep this project memory",
              similarity: 0.88,
              metadata: { category: "project", scope: "project" },
            },
            {
              id: "mem_2",
              memory: "Wrong category",
              similarity: 0.72,
              metadata: { category: "decision", scope: "project" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    const provider = new SupermemoryProvider({
      apiKey: "sm-test",
      baseUrl: "http://localhost:6767",
      projectContainerTag: "project_tag",
      globalContainerTag: "global_tag",
      similarityThreshold: 0.75,
    });

    const results = await provider.search("project", {
      scope: "project",
      category: "project",
      topK: 3,
    });

    expect(results).toEqual([
      {
        id: "mem_1",
        content: "Keep this project memory",
        metadata: {
          category: "project",
          scope: "project",
        },
        relevance: 0.88,
      },
    ]);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      q: "project",
      containerTag: "project_tag",
      threshold: 0.75,
      searchMode: "memories",
      filters: {
        AND: [{ key: "category", value: "project" }],
      },
    });
    expect(body.limit).toBeGreaterThanOrEqual(3);
  });

  it("lists non-forgotten latest memories across multiple pages", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            memoryEntries: [
              {
                id: "mem_1",
                memory: "Older project note",
                isForgotten: false,
                metadata: { category: "project", scope: "project" },
              },
            ],
            pagination: {
              currentPage: 1,
              totalPages: 2,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            memoryEntries: [
              {
                id: "mem_2",
                memory: "Forgotten note",
                isForgotten: true,
                metadata: { category: "project", scope: "project" },
              },
              {
                id: "mem_3",
                memory: "Newest project note",
                isForgotten: false,
                metadata: { category: "project", scope: "project" },
              },
            ],
            pagination: {
              currentPage: 2,
              totalPages: 2,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      );
    const provider = new SupermemoryProvider({
      apiKey: "sm-test",
      baseUrl: "http://localhost:6767",
      projectContainerTag: "project_tag",
      globalContainerTag: "global_tag",
    });

    const results = await provider.list({
      scope: "project",
      category: "project",
      limit: 2,
    });

    expect(results).toEqual([
      {
        id: "mem_1",
        content: "Older project note",
        metadata: {
          category: "project",
          scope: "project",
        },
      },
      {
        id: "mem_3",
        content: "Newest project note",
        metadata: {
          category: "project",
          scope: "project",
        },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      containerTags: ["project_tag"],
    });
  });

  it("forgets memories by trying both configured container tags", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "mem_123", forgotten: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    const provider = new SupermemoryProvider({
      apiKey: "sm-test",
      baseUrl: "http://localhost:6767",
      projectContainerTag: "project_tag",
      globalContainerTag: "global_tag",
    });

    await provider.delete("mem_123");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      containerTag: "global_tag",
      id: "mem_123",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      containerTag: "project_tag",
      id: "mem_123",
    });
  });

  it("treats missing deletes as a no-op", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      );
    const provider = new SupermemoryProvider({
      apiKey: "sm-test",
      baseUrl: "http://localhost:6767",
      projectContainerTag: "project_tag",
      globalContainerTag: "global_tag",
    });

    await expect(provider.delete("missing-id")).resolves.toBeUndefined();
  });

  it("prefers the runtime base URL override env var when set", async () => {
    vi.stubEnv("SUPERMEMORY_API_URL", "http://supermemory.override:9999");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    const provider = new SupermemoryProvider({
      apiKey: "sm-test",
      baseUrl: "http://localhost:6767",
      projectContainerTag: "project_tag",
      globalContainerTag: "global_tag",
    });

    await provider.search("test", {
      scope: "project",
      topK: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://supermemory.override:9999/v4/search",
      expect.any(Object)
    );
  });

  it("aborts stalled requests after the timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const signal = init?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true }
        );
      });
    });
    const provider = new SupermemoryProvider({
      apiKey: "sm-test",
      baseUrl: "http://localhost:6767",
      projectContainerTag: "project_tag",
      globalContainerTag: "global_tag",
    });

    const request = provider.search("test", {
      scope: "project",
      topK: 1,
    });
    const expectation = expect(request).rejects.toThrow(
      "Supermemory request timed out after 30000ms (POST /v4/search)"
    );

    await vi.advanceTimersByTimeAsync(30_000);

    await expectation;
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
