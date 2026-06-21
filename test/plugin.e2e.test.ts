import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createMemoryResult, createMockProvider, createToolContext } from "./test-helpers.js";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(path: string, value: object): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

afterEach(async () => {
  vi.doUnmock("node:os");
  vi.doUnmock("../src/providers/index.js");
  vi.restoreAllMocks();
  vi.resetModules();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("plugin bootstrap e2e", () => {
  it("loads project config, initializes the provider, and exposes tool aliases", async () => {
    const homeDir = await makeTempDir("opencode-memory-home-");
    const worktree = await makeTempDir("opencode-memory-worktree-");
    await writeJson(join(worktree, ".opencode-memory.json"), {
      provider: "mem0",
      scope: "project",
    });

    const provider = createMockProvider({
      add: vi.fn().mockResolvedValue({ id: "stored-memory" }),
      search: vi.fn().mockResolvedValue([
        createMemoryResult({
          id: "memory-1",
          content: "Remember the release checklist",
          category: "project",
          scope: "project",
          relevance: 0.8765,
        }),
      ]),
    });
    const createProvider = vi.fn(() => provider);

    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return {
        ...actual,
        homedir: () => homeDir,
      };
    });
    vi.doMock("../src/providers/index.js", () => ({ createProvider }));

    const { default: plugin } = await import("../src/index.js");
    const hooks = await plugin({
      directory: worktree,
      worktree,
    } as any);

    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "mem0",
        scope: "project",
      })
    );
    expect(Object.keys(hooks.tool ?? {})).toEqual(
      expect.arrayContaining([
        "memory-store",
        "memory-recall",
        "memory-delete",
        "memory-list",
        "memory-summary",
        "memory_store",
        "memory_recall",
        "memory_delete",
        "memory_list",
        "memory_summary",
      ])
    );

    const context = createToolContext({
      directory: worktree,
      worktree,
    });
    const storeOutput = await hooks.tool!["memory-store"].execute(
      {
        content: "Remember the release checklist",
        category: "project",
      },
      context
    );
    const recallOutput = await hooks.tool!.memory_recall.execute(
      {
        query: "release checklist",
      },
      context
    );

    expect(provider.add).toHaveBeenCalledWith("Remember the release checklist", {
      category: "project",
      tags: undefined,
      scope: "project",
    });
    expect(provider.search).toHaveBeenCalledWith("release checklist", {
      scope: "project",
      category: undefined,
      topK: 5,
    });
    expect(storeOutput).toContain("Memory stored (stored-memory)");
    expect(recallOutput).toContain("Remember the release checklist");
  });

  it("loads .opencode-memory.json from the worktree root even when the session starts in a subdirectory", async () => {
    const homeDir = await makeTempDir("opencode-memory-home-");
    const worktree = await makeTempDir("opencode-memory-worktree-");
    const nestedDirectory = join(worktree, "packages", "app");
    await mkdir(nestedDirectory, { recursive: true });
    await writeJson(join(worktree, ".opencode-memory.json"), {
      provider: "honcho",
      scope: "project",
      honcho: {
        workspaceId: "root-config",
      },
    });

    const provider = createMockProvider();
    const createProvider = vi.fn(() => provider);

    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return {
        ...actual,
        homedir: () => homeDir,
      };
    });
    vi.doMock("../src/providers/index.js", () => ({ createProvider }));

    const { default: plugin } = await import("../src/index.js");
    await plugin({
      directory: nestedDirectory,
      worktree,
    } as any);

    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "honcho",
        scope: "project",
        honcho: {
          workspaceId: "root-config",
        },
      })
    );
  });

  it("keeps tool runtimes isolated across multiple plugin initializations", async () => {
    const homeDir = await makeTempDir("opencode-memory-home-");
    const firstWorktree = await makeTempDir("opencode-memory-worktree-a-");
    const secondWorktree = await makeTempDir("opencode-memory-worktree-b-");
    await writeJson(join(firstWorktree, ".opencode-memory.json"), {
      provider: "mem0",
      scope: "global",
    });
    await writeJson(join(secondWorktree, ".opencode-memory.json"), {
      provider: "honcho",
      scope: "project",
    });

    const firstProvider = createMockProvider({
      add: vi.fn().mockResolvedValue({ id: "first-memory" }),
    });
    const secondProvider = createMockProvider({
      add: vi.fn().mockResolvedValue({ id: "second-memory" }),
    });
    const createProvider = vi
      .fn()
      .mockReturnValueOnce(firstProvider)
      .mockReturnValueOnce(secondProvider);

    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return {
        ...actual,
        homedir: () => homeDir,
      };
    });
    vi.doMock("../src/providers/index.js", () => ({ createProvider }));

    const { default: plugin } = await import("../src/index.js");
    const firstHooks = await plugin({
      directory: firstWorktree,
      worktree: firstWorktree,
    } as any);
    await plugin({
      directory: secondWorktree,
      worktree: secondWorktree,
    } as any);

    const context = createToolContext({
      directory: firstWorktree,
      worktree: firstWorktree,
    });
    await firstHooks.tool!["memory-store"].execute(
      {
        content: "Remember this first",
        category: "decision",
      },
      context
    );

    expect(firstProvider.add).toHaveBeenCalledWith("Remember this first", {
      category: "decision",
      tags: undefined,
      scope: "global",
    });
    expect(secondProvider.add).not.toHaveBeenCalled();
  });
});
