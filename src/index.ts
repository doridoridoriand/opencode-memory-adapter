import type { Plugin } from "@opencode-ai/plugin";
import { createProvider, type MemoryPluginConfig } from "./providers/index.js";
import { loadConfig } from "./config.js";
import { setProvider } from "./memory-singleton.js";
import { memoryStore } from "./tools/memory-store.js";
import { memoryRecall } from "./tools/memory-recall.js";
import { memoryDelete } from "./tools/memory-delete.js";
import { memoryList } from "./tools/memory-list.js";
import { memorySummary } from "./tools/memory-summary.js";

export default (async ({ directory }) => {
  const configDir = directory || process.cwd();
  const config = loadConfig(configDir);

  const provider = createProvider(config);
  setProvider(provider);

  if (provider) {
    return {
      tool: {
        memory_store: memoryStore,
        memory_recall: memoryRecall,
        memory_delete: memoryDelete,
        memory_list: memoryList,
        memory_summary: memorySummary,
      },
    };
  }
  return {};
}) satisfies Plugin;
