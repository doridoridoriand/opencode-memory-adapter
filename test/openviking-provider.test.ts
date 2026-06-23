import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenVikingProvider } from "../src/providers/openviking-provider.js";

afterEach(async () => {
  vi.restoreAllMocks();
});

describe("OpenVikingProvider", () => {
  it("stores memories through WebDAV and waits for indexing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.endsWith("/api/v1/fs/mkdir")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.includes("/webdav/resources/")) {
        return new Response("", { status: 201 });
      }

      if (url.endsWith("/api/v1/system/wait")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    const provider = new OpenVikingProvider();

    const result = await provider.add("Ship release notes", {
      category: "decision",
      scope: "project",
      tags: ["release"],
      source: "unit-test",
    });

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    const mkdirCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/v1/fs/mkdir")
    );
    expect(mkdirCalls).toHaveLength(3);
    expect(mkdirCalls.map(([, request]) => JSON.parse(String(request?.body)))).toEqual([
      { uri: "viking://resources/opencode-memory-adapter" },
      { uri: "viking://resources/opencode-memory-adapter/project" },
      { uri: "viking://resources/opencode-memory-adapter/project/decision" },
    ]);

    const putCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/webdav/resources/")
    );
    expect(putCall?.[0]).toBe(
      `http://localhost:1933/webdav/resources/opencode-memory-adapter/project/decision/${result.id}.md`
    );
    expect(String(putCall?.[1]?.body)).toContain("Ship release notes");
    expect(String(putCall?.[1]?.body)).toContain("\"scope\":\"project\"");
    expect(String(putCall?.[1]?.body)).toContain("\"source\":\"unit-test\"");

    const waitCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/v1/system/wait")
    );
    expect(waitCall?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ timeout: 120 }),
    });
  });

  it("searches retrieved resources and ignores internal or non-memory files", async () => {
    const resources = {
      read: vi.fn(async (path: string) => {
        if (path.endsWith("/keep.md")) {
          return '<!-- opencode-memory-adapter:{"category":"decision","scope":"project","tags":["release"]} -->\nShip release notes';
        }
        return "Legacy text memory";
      }),
      list: vi.fn(),
      remove: vi.fn(),
      createDirectory: vi.fn(),
      add: vi.fn(),
    };
    const retrieval = {
      find: vi.fn().mockResolvedValue({
        resources: [
          {
            uri: "viking://resources/opencode-memory-adapter/project/decision/keep.md",
            score: 0.88,
          },
          {
            uri: "viking://resources/opencode-memory-adapter/global/conversation/skip.md",
            score: 0.25,
          },
          {
            uri: "viking://resources/opencode-memory-adapter/project/decision/.overview.md",
            score: 0.7,
          },
          {
            uri: "viking://resources/other/random.txt",
            score: 1,
          },
        ],
      }),
    };
    const provider = new OpenVikingProvider();
    (provider as any).getSdk = vi.fn().mockResolvedValue({ resources, retrieval });

    const results = await provider.search("release", {
      scope: "project",
      category: "decision",
      topK: 2,
    });

    expect(retrieval.find).toHaveBeenCalledWith("release", {
      targetUri: "viking://resources/opencode-memory-adapter/project/decision",
      limit: 2,
    });
    expect(results).toEqual([
      {
        id: "keep",
        content: "Ship release notes",
        metadata: {
          category: "decision",
          scope: "project",
          tags: ["release"],
        },
        relevance: 0.88,
      },
    ]);
    expect(resources.read).not.toHaveBeenCalledWith(
      "opencode-memory-adapter/project/decision/.overview.md"
    );
  });

  it("returns an empty result when the retrieval target does not exist", async () => {
    const provider = new OpenVikingProvider();
    (provider as any).getSdk = vi.fn().mockResolvedValue({
      resources: {
        read: vi.fn(),
        list: vi.fn(),
        remove: vi.fn(),
        createDirectory: vi.fn(),
        add: vi.fn(),
      },
      retrieval: {
        find: vi.fn().mockRejectedValue(new Error("resource not found")),
      },
    });

    await expect(
      provider.search("missing", {
        scope: "project",
        category: "decision",
        topK: 3,
      })
    ).resolves.toEqual([]);
  });

  it("lists and sorts stored memories by modification time", async () => {
    const resources = {
      list: vi.fn().mockResolvedValue([
        {
          uri: "viking://resources/opencode-memory-adapter/project/decision/older.md",
          isDir: false,
          modTime: "2025-01-01T00:00:00.000Z",
        },
        {
          uri: "viking://resources/opencode-memory-adapter/project/decision/newer.md",
          isDir: false,
          modTime: "2025-01-02T00:00:00.000Z",
        },
        {
          uri: "viking://resources/opencode-memory-adapter/project/decision",
          isDir: true,
          modTime: "2025-01-03T00:00:00.000Z",
        },
        {
          uri: "viking://resources/opencode-memory-adapter/project/decision/ignore.txt",
          isDir: false,
          modTime: "2025-01-04T00:00:00.000Z",
        },
        {
          uri: "viking://resources/opencode-memory-adapter/project/decision/.abstract.md",
          isDir: false,
          modTime: "2025-01-05T00:00:00.000Z",
        },
      ]),
      read: vi.fn(async (path: string) => {
        if (path.endsWith("/newer.md")) {
          return '<!-- opencode-memory-adapter:{"category":"decision","scope":"project"} -->\nNewer memory';
        }
        return '<!-- opencode-memory-adapter:{"category":"decision","scope":"project"} -->\nOlder memory';
      }),
      remove: vi.fn(),
      createDirectory: vi.fn(),
      add: vi.fn(),
    };
    const provider = new OpenVikingProvider();
    (provider as any).getSdk = vi.fn().mockResolvedValue({
      resources,
      retrieval: { find: vi.fn() },
    });

    const results = await provider.list({
      scope: "project",
      category: "decision",
      limit: 1,
    });

    expect(resources.list).toHaveBeenCalledWith("opencode-memory-adapter/project/decision", {
      recursive: true,
    });
    expect(results).toEqual([
      {
        id: "newer",
        content: "Newer memory",
        metadata: {
          category: "decision",
          scope: "project",
        },
      },
    ]);
    expect(resources.read).not.toHaveBeenCalledWith(
      "opencode-memory-adapter/project/decision/.abstract.md"
    );
  });

  it("deletes resources by resolved id, waits for reindexing, and summarizes recent search results", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const resources = {
      list: vi.fn().mockResolvedValue([
        {
          uri: "viking://resources/opencode-memory-adapter/project/decision/delete-me.md",
          isDir: false,
        },
      ]),
      remove: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      createDirectory: vi.fn(),
      add: vi.fn(),
    };
    const provider = new OpenVikingProvider();
    (provider as any).getSdk = vi.fn().mockResolvedValue({
      resources,
      retrieval: { find: vi.fn() },
    });
    vi.spyOn(provider, "search").mockResolvedValue([
      {
        id: "memory-1",
        content: "Recent conversation",
        metadata: { category: "conversation", scope: "global" },
      },
      {
        id: "memory-2",
        content: "Recent decision",
        metadata: { category: "decision", scope: "project" },
      },
    ]);

    await provider.delete("delete-me");
    const summary = await provider.summarize();

    expect(resources.list).toHaveBeenCalledWith("opencode-memory-adapter", { recursive: true });
    expect(resources.remove).toHaveBeenCalledWith(
      "opencode-memory-adapter/project/decision/delete-me.md"
    );
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:1933/api/v1/system/wait", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ timeout: 120 }),
    });
    expect(summary).toBe("[conversation] Recent conversation\n[decision] Recent decision");
  });
});
