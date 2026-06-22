import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenVikingProvider } from "../src/providers/openviking-provider.js";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("OpenVikingProvider", () => {
  it("stores memories as markdown resources and cleans up temp files", async () => {
    let uploadedFile = "";
    let uploadedContents = "";
    const resources = {
      createDirectory: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(async (filePath: string) => {
        uploadedFile = filePath;
        uploadedContents = await readFile(filePath, "utf8");
      }),
      read: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(),
    };
    const provider = new OpenVikingProvider();
    (provider as any).getSdk = vi.fn().mockResolvedValue({
      resources,
      retrieval: { find: vi.fn() },
    });

    const result = await provider.add("Ship release notes", {
      category: "decision",
      scope: "project",
      tags: ["release"],
      source: "unit-test",
    });

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(resources.createDirectory).toHaveBeenNthCalledWith(1, "opencode-memory-adapter");
    expect(resources.createDirectory).toHaveBeenNthCalledWith(
      2,
      "opencode-memory-adapter/project"
    );
    expect(resources.createDirectory).toHaveBeenNthCalledWith(
      3,
      "opencode-memory-adapter/project/decision"
    );
    expect(resources.add).toHaveBeenCalledWith(expect.any(String), {
      target: "opencode-memory-adapter/project/decision/",
      wait: true,
    });

    expect(uploadedContents).toContain("Ship release notes");
    expect(uploadedContents).toContain("\"scope\":\"project\"");
    expect(uploadedContents).toContain("\"source\":\"unit-test\"");
    await expect(access(uploadedFile)).rejects.toThrow();
  });

  it("searches retrieved resources and ignores non-memory files", async () => {
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
  });

  it("deletes resources by resolved id and summarizes recent search results", async () => {
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
    expect(summary).toBe("[conversation] Recent conversation\n[decision] Recent decision");
  });
});
