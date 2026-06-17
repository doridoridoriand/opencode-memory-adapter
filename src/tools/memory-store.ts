import { z } from "zod";
import { tool } from "@opencode-ai/plugin";
import { getProvider } from "../memory-singleton.js";
import { resolveScope } from "./shared.js";

export const memoryStore = tool({
  description: "Save a memory entry with content and metadata.",
  args: {
    content: z.string().describe("The content/text to store as a memory."),
    category: z
      .enum(["conversation", "project", "preference", "decision"])
      .describe("Category of the memory."),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags for the memory."),
    scope: z
      .enum(["global", "project"])
      .optional()
      .describe("Whether the memory is global or project-scoped."),
  },
  async execute(args) {
    const provider = getProvider();
    const scope = resolveScope(args.scope);
    const result = await provider.add(args.content, {
      category: args.category,
      tags: args.tags,
      scope,
    });
    return `<title>Memory stored (${result.id})</title>\n\nSuccessfully saved memory.`;
  },
});
