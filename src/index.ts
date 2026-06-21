import type { Plugin } from "@opencode-ai/plugin";
import { createProvider } from "./providers/index.js";
import { loadConfig } from "./config.js";
import { createMemoryStoreTool } from "./tools/memory-store.js";
import { createMemoryRecallTool } from "./tools/memory-recall.js";
import { createMemoryDeleteTool } from "./tools/memory-delete.js";
import { createMemoryListTool } from "./tools/memory-list.js";
import { createMemorySummaryTool } from "./tools/memory-summary.js";

export default (async ({ directory, worktree }) => {
  const configRoot = worktree || directory || process.cwd();
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
}) satisfies Plugin;
