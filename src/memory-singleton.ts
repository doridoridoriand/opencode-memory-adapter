import type { MemoryProvider } from "./types.js";

let providerInstance: MemoryProvider | null = null;

export function setProvider(p: MemoryProvider): void {
  providerInstance = p;
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
