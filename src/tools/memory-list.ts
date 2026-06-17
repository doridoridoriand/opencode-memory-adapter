import { z } from "zod";
import { tool } from "@opencode-ai/plugin";
import { getProvider } from "../memory-singleton.js";

export const memoryList = tool({
  description: "List stored memories with optional filtering.",
  args: {
    scope: z
      .enum(["global", "project"])
      .optional()
      .describe("Filter memories by scope."),
    category: z
      .enum(["conversation", "project", "preference", "decision"])
      .optional()
      .describe("Filter memories by category."),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of memories to return. Defaults to 50."),
  },
  async execute(args) {
    const provider = getProvider();
    const results = await provider.list({
      scope: args.scope,
      category: args.category,
      limit: args.limit ?? 50,
    });
    if (results.length === 0) {
      return `<title>No memories found</title>\n\nNo memories found with the given filters.`;
    }
    const lines = results.map(
      (r) => `- [${r.id}] [${r.metadata.category}] ${r.content}`
    );
    return `<title>Listed ${results.length} memories</title>\n\n${lines.join("\n")}`;
  },
});
