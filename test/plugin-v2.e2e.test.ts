import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { Plugin } from "@opencode/plugin";
import type { Info, ToolEditor } from "@opencode/plugin/promise/tool";
import { createMemoryResult, createMockProvider } from "./test-helpers.js";
import type { MemoryProvider } from "../src/types.js";

const tempDirs: string[] = [];

async function bootstrap(provider: MemoryProvider) {
  const root = await mkdtemp(join(tmpdir(), "opencode-memory-v2-"));
  tempDirs.push(root);
  const worktree = join(root, "worktree");
  const directory = join(worktree, "packages", "app");
  await mkdir(directory, { recursive: true });
  await writeFile(join(worktree, ".opencode-memory-adapter.json"), JSON.stringify({
    provider: "honcho",
    scope: "project",
    honcho: { workspaceId: "worktree-config" },
  }));
  vi.doMock("node:os", async () => ({
    ...await vi.importActual<typeof import("node:os")>("node:os"),
    homedir: () => root,
  }));
  const createProvider = vi.fn(() => provider);
  vi.doMock("../src/providers/index.js", () => ({ createProvider }));
  const { default: plugin } = await import("../src/index.js");
  const tools = new Map<string, Info>();
  const editor = { add: (tool: Info) => tools.set(tool.name, tool) } as ToolEditor;
  const transform = vi.fn(async (edit: (editor: ToolEditor) => void) => {
    edit(editor);
    return { dispose: async () => {} };
  });
  const context = {
    location: {
      directory,
      project: { directory: worktree, canonical: join(root, "other-checkout"), id: "test-project" },
    },
    tool: { transform },
  } as unknown as Plugin.Context;
  const execute = (name: string, input: unknown) => tools.get(name)!.execute(input, {} as any);
  return { plugin, context, tools, transform, editor, execute, createProvider };
}

afterEach(async () => {
  vi.doUnmock("node:os");
  vi.doUnmock("../src/providers/index.js");
  vi.restoreAllMocks();
  vi.resetModules();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("OpenCode V2 plugin", () => {
  it("loads the worktree config and executes all memory operations with V2 results", async () => {
    const memory = createMemoryResult({ id: "stored-memory", content: "Release checklist", category: "project", scope: "project" });
    const provider = createMockProvider({
      add: vi.fn().mockResolvedValue({ id: memory.id }),
      search: vi.fn().mockResolvedValue([memory]),
      list: vi.fn().mockResolvedValue([memory]),
      delete: vi.fn(),
      summarize: vi.fn().mockResolvedValue("Summary body"),
      dispose: vi.fn(),
    });
    const { plugin, context, tools, execute, createProvider } = await bootstrap(provider);
    const cleanup = await plugin.setup(context);

    expect(plugin.id).toBe("opencode-memory-adapter");
    expect(createProvider).toHaveBeenCalledWith(expect.objectContaining({
      provider: "honcho", scope: "project", honcho: { workspaceId: "worktree-config" },
    }));
    expect([...tools.keys()]).toHaveLength(10);
    for (const name of ["store", "recall", "list", "delete", "summary"]) {
      expect(tools.has(`memory-${name}`)).toBe(true);
      expect(tools.has(`memory_${name}`)).toBe(true);
      expect(tools.get(`memory-${name}`)?.input).toEqual(tools.get(`memory_${name}`)?.input);
      expect(tools.get(`memory-${name}`)?.options).toEqual({ codemode: false });
    }
    expect((await execute("memory-store", { content: memory.content, category: "project" })).content)
      .toContain("Memory stored (stored-memory)");
    expect((await execute("memory_recall", { query: "checklist" })).content).toContain(memory.content);
    expect((await execute("memory-list", {})).content).toContain(memory.id);
    expect((await execute("memory_summary", { sessionId: "session-1" })).content).toContain("Summary body");
    expect((await execute("memory-delete", { id: memory.id })).content).toContain("Memory deleted");
    expect(provider.add).toHaveBeenCalledWith(memory.content, { category: "project", scope: "project", tags: undefined });
    expect(provider.search).toHaveBeenCalledWith("checklist", { scope: "project", category: undefined, topK: 5 });
    expect(provider.list).toHaveBeenCalledWith({ scope: "project", category: undefined, limit: 50 });
    expect(provider.summarize).toHaveBeenCalledWith("session-1");
    expect(provider.delete).toHaveBeenCalledWith(memory.id);
    expect(provider.dispose).not.toHaveBeenCalled();
    expect(cleanup).toBeTypeOf("function");
    await cleanup?.();
    expect(provider.dispose).toHaveBeenCalledOnce();
  });

  it("publishes JSON schemas and rejects invalid arguments before invoking the provider", async () => {
    const provider = createMockProvider({ add: vi.fn(), search: vi.fn(), list: vi.fn(), delete: vi.fn() });
    const { plugin, context, tools, execute } = await bootstrap(provider);
    await plugin.setup(context);
    expect(tools.get("memory-store")?.input).toMatchObject({
      type: "object", required: ["content", "category"], additionalProperties: false,
      properties: { content: { type: "string" }, category: { enum: ["conversation", "project", "preference", "decision"] } },
    });
    await expect(execute("memory-store", { content: "Invalid", category: "unknown" })).rejects.toThrow();
    await expect(execute("memory-store", { category: "project" })).rejects.toThrow();
    await expect(execute("memory-recall", { query: "q", topK: 0 })).rejects.toThrow();
    await expect(execute("memory-list", { limit: 1.5 })).rejects.toThrow();
    await expect(execute("memory-delete", {})).rejects.toThrow();
    expect(provider.add).not.toHaveBeenCalled();
    expect(provider.search).not.toHaveBeenCalled();
    expect(provider.list).not.toHaveBeenCalled();
    expect(provider.delete).not.toHaveBeenCalled();
  });

  it("replays tool registration without recreating or calling the provider", async () => {
    const provider = createMockProvider({ add: vi.fn(), dispose: vi.fn() });
    const { plugin, context, tools, transform, editor, createProvider } = await bootstrap(provider);
    await plugin.setup(context);
    const firstStore = tools.get("memory-store");
    transform.mock.calls[0][0](editor);
    transform.mock.calls[0][0](editor);
    expect(tools.size).toBe(10);
    expect(tools.get("memory-store")).toBe(firstStore);
    expect(createProvider).toHaveBeenCalledOnce();
    expect(provider.add).not.toHaveBeenCalled();
    expect(provider.dispose).not.toHaveBeenCalled();
  });

  it("disposes the provider when tool registration fails", async () => {
    const provider = createMockProvider({ dispose: vi.fn() });
    const { plugin, context, transform } = await bootstrap(provider);
    const failure = new Error("registration failed");
    transform.mockRejectedValueOnce(failure);
    await expect(plugin.setup(context)).rejects.toBe(failure);
    expect(provider.dispose).toHaveBeenCalledOnce();
  });

  it("keeps V2 runtimes isolated between locations", async () => {
    const first = createMockProvider({ add: vi.fn().mockResolvedValue({ id: "first" }), dispose: vi.fn() });
    const second = createMockProvider({ add: vi.fn().mockResolvedValue({ id: "second" }), dispose: vi.fn() });
    const { plugin, context, tools, execute, createProvider } = await bootstrap(first);
    createProvider.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const firstCleanup = await plugin.setup(context);
    const firstStore = tools.get("memory-store")!;
    const secondWorktree = await mkdtemp(join(tmpdir(), "opencode-memory-v2-second-"));
    tempDirs.push(secondWorktree);
    await writeFile(join(secondWorktree, ".opencode-memory-adapter.json"), JSON.stringify({
      provider: "mem0", scope: "global",
    }));
    const secondContext = {
      ...context,
      location: {
        ...context.location,
        directory: secondWorktree,
        project: { ...context.location.project, directory: secondWorktree },
      },
    } as Plugin.Context;
    const secondCleanup = await plugin.setup(secondContext);
    await firstStore.execute({ content: "First", category: "decision" }, {} as any);
    await execute("memory_store", { content: "Second", category: "project" });
    expect(first.add).toHaveBeenCalledWith("First", expect.objectContaining({ scope: "project" }));
    expect(second.add).toHaveBeenCalledWith("Second", expect.objectContaining({ scope: "global" }));
    await firstCleanup?.();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).not.toHaveBeenCalled();
    await secondCleanup?.();
    expect(second.dispose).toHaveBeenCalledOnce();
  });
});
