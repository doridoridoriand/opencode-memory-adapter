import { Plugin } from "@opencode/plugin";
import type { Plugin as LegacyPlugin } from "@opencode-ai/plugin";
import { createProvider } from "./providers/index.js";
import { loadConfig } from "./config.js";
import { createMemoryStoreTool } from "./tools/memory-store.js";
import { createMemoryRecallTool } from "./tools/memory-recall.js";
import { createMemoryDeleteTool } from "./tools/memory-delete.js";
import { createMemoryListTool } from "./tools/memory-list.js";
import { createMemorySummaryTool } from "./tools/memory-summary.js";

function createRuntime(configRoot: string) {
  const config = loadConfig(configRoot);

  const provider = createProvider(config);
  const memoryStore = createMemoryStoreTool({ provider, config });
  const memoryRecall = createMemoryRecallTool({ provider, config });
  const memoryDelete = createMemoryDeleteTool({ provider, config });
  const memoryList = createMemoryListTool({ provider, config });
  const memorySummary = createMemorySummaryTool({ provider, config });

  return {
    async dispose() {
      await provider.dispose?.();
    },
    tool: {
      "memory-store": memoryStore,
      "memory-recall": memoryRecall,
      "memory-delete": memoryDelete,
      "memory-list": memoryList,
      "memory-summary": memorySummary,
      memory_store: memoryStore,
      memory_recall: memoryRecall,
      memory_delete: memoryDelete,
      memory_list: memoryList,
      memory_summary: memorySummary,
    },
  };
}

const server = (async ({ directory, worktree }: { directory: string; worktree?: string }) => {
  return createRuntime(worktree || directory || process.cwd());
}) satisfies LegacyPlugin;

const plugin: Plugin.Plugin & { server: typeof server } = {
  ...Plugin.define({
    id: "opencode-memory-adapter",
    async setup(ctx) {
      // V2's project.directory is the current worktree root; canonical may refer
      // to a different checkout, and location.directory may be a subdirectory.
      const runtime = createRuntime(ctx.location.project.directory || ctx.location.directory);
      try {
        const tools = Object.entries(runtime.tool).map(([name, definition]) => definition.toV2(name));
        await ctx.tool.transform((editor) => {
          for (const definition of tools) editor.add(definition);
        });
      } catch (error) {
        await runtime.dispose();
        throw error;
      }
      return () => runtime.dispose();
    },
  }),
  server,
};

export default plugin;
