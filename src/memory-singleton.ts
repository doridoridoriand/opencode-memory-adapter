import type { MemoryPluginConfig, MemoryProvider } from "./types.js";

let providerInstance: MemoryProvider | null = null;
let configInstance: MemoryPluginConfig | null = null;

export function setProvider(p: MemoryProvider): void {
  providerInstance = p;
}

export function setConfig(config: MemoryPluginConfig): void {
  configInstance = config;
}

export function getProvider(): MemoryProvider {
  if (!providerInstance) {
    throw new Error(
      "Memory provider not initialized. " +
        "Ensure opencode-memory-plugin is configured in opencode.json"
    );
  }
  return providerInstance;
}

export function getConfig(): MemoryPluginConfig {
  if (!configInstance) {
    throw new Error(
      "Memory config not initialized. " +
        "Ensure opencode-memory-plugin is configured in opencode.json"
    );
  }
  return configInstance;
}
