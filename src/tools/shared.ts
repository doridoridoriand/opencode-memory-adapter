import type { MemoryPluginConfig, MemoryProvider, MemoryScope } from "../types.js";

export interface ToolRuntime {
  provider: MemoryProvider;
  config: MemoryPluginConfig;
}

export function resolveScope(config: MemoryPluginConfig, scope?: MemoryScope): MemoryScope {
  return scope ?? config.scope ?? "global";
}
