import type { MemoryProvider, MemoryPluginConfig, MemoryProviderName } from "../types.js";
import { Mem0Provider } from "./mem0-provider.js";
import { HonchoProvider } from "./honcho-provider.js";
import { OpenVikingProvider } from "./openviking-provider.js";

export function createProvider(config: MemoryPluginConfig): MemoryProvider {
  const provider = config.provider ?? "mem0";

  switch (provider) {
    case "mem0":
      return new Mem0Provider(config.mem0);
    case "honcho":
      return new HonchoProvider(config.honcho);
    case "openviking":
      return new OpenVikingProvider(config.openviking);
    default: {
      const p = provider as string;
      throw new Error(
        `Unknown memory provider: "${p}". ` +
          `Supported providers: mem0, honcho, openviking.`
      );
    }
  }
}

export { Mem0Provider } from "./mem0-provider.js";
export { HonchoProvider } from "./honcho-provider.js";
export { OpenVikingProvider } from "./openviking-provider.js";
export { BaseMemoryProvider } from "./base.js";
export type { MemoryPluginConfig } from "../types.js";
