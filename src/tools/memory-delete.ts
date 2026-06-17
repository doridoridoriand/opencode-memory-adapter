import { z } from "zod";
import { tool } from "@opencode-ai/plugin";
import { getProvider } from "../memory-singleton.js";

export const memoryDelete = tool({
  description: "Delete a memory entry by its ID.",
  args: {
    id: z.string().describe("The ID of the memory to delete."),
  },
  async execute(args) {
    const provider = getProvider();
    await provider.delete(args.id);
    return `<title>Memory deleted</title>\n\nSuccessfully deleted memory ${args.id}`;
  },
});
