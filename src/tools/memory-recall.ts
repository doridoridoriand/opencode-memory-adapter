import { z } from "zod";
import { tool } from "@opencode-ai/plugin";
import { getConfig, getProvider } from "../memory-singleton.js";

export const memoryRecall = tool({
  description: "Semantically search stored memories by query.",
  args: {
    query: z.string().describe("The search query for semantic memory search."),
    scope: z
      .enum(["global", "project"])
      .optional()
      .describe("Filter memories by scope."),
    category: z
      .enum(["conversation", "project", "preference", "decision"])
      .optional()
      .describe("Filter memories by category."),
    topK: z
      .number()
      .optional()
      .describe("Number of results to return. Defaults to 5."),
  },
  async execute(args) {
    const provider = getProvider();
    const scope = args.scope ?? getConfig().scope;
    const results = await provider.search(args.query, {
      scope,
      category: args.category,
      topK: args.topK ?? 5,
    });
    if (results.length === 0) {
      return `<title>No memories found</title>\n\nNo matching memories found for: "${args.query}"`;
    }
    const lines = results.map(
      (r) => `- [${r.metadata.category}] ${r.content}` + (r.relevance != null ? ` (relevance: ${r.relevance.toFixed(3)})` : "")
    );
    return `<title>Found ${results.length} memories</title>\n\n${lines.join("\n")}`;
  },
});
