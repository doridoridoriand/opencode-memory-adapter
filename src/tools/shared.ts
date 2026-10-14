import { z } from "zod";
import type { Info } from "@opencode/plugin/promise/tool";
import type { MemoryPluginConfig, MemoryProvider, MemoryScope } from "../types.js";

// The memory operations do not depend on either version of OpenCode's tool context.
export function tool<Args extends z.ZodRawShape>(definition: {
  description: string;
  args: Args;
  execute(args: z.infer<z.ZodObject<Args>>, context?: unknown): Promise<string>;
}) {
  const schema = z.object(definition.args);
  return {
    ...definition,
    toV2(name: string): Info {
      return {
        name,
        description: definition.description,
        input: z.toJSONSchema(schema),
        options: { codemode: false as const },
        async execute(input: unknown) {
          return { content: await definition.execute(schema.parse(input)) };
        },
      };
    },
  };
}

export interface ToolRuntime {
  provider: MemoryProvider;
  config: MemoryPluginConfig;
}

export function resolveScope(config: MemoryPluginConfig, scope?: MemoryScope): MemoryScope {
  return scope ?? config.scope ?? "global";
}
