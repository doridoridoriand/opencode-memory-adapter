import { z } from "zod";
import { tool } from "@opencode-ai/plugin";
import type { ToolRuntime } from "./shared.js";

export function createMemoryDeleteTool(runtime: ToolRuntime) {
  return tool({
    description: "Delete a memory entry by its ID.",
    args: {
      id: z.string().describe("The ID of the memory to delete."),
    },
    async execute(args) {
      await runtime.provider.delete(args.id);
      return `<title>Memory deleted</title>\n\nSuccessfully deleted memory ${args.id}`;
    },
  });
}
