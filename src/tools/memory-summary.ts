import { z } from "zod";
import { tool } from "@opencode-ai/plugin";
import type { ToolRuntime } from "./shared.js";

export function createMemorySummaryTool(runtime: ToolRuntime) {
  return tool({
    description: "Generate a summary of recent conversation memories.",
    args: {
      auto: z
        .boolean()
        .optional()
        .describe("Whether this is an auto-triggered summary."),
      sessionId: z
        .string()
        .optional()
        .describe("Optional provider-specific session hint for providers that support it."),
    },
    async execute(args) {
      if (typeof runtime.provider.summarize === "function") {
        const summary = await runtime.provider.summarize(args.sessionId);
        if (!summary) {
          return "No recent memories to summarize.";
        }
        return `<title>Memory summary</title>\n\n${summary}`;
      }
      return "summarize is not supported by the current memory provider.";
    },
  });
}
