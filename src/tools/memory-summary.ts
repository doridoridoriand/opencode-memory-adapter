import { z } from "zod";
import { tool } from "@opencode-ai/plugin";
import { getProvider } from "../memory-singleton.js";

export const memorySummary = tool({
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
    const provider = getProvider();
    if (typeof provider.summarize === "function") {
      const summary = await provider.summarize(args.sessionId);
      if (!summary) {
        return "No recent memories to summarize.";
      }
      return `<title>Memory summary</title>\n\n${summary}`;
    }
    return "summarize is not supported by the current memory provider.";
  },
});
