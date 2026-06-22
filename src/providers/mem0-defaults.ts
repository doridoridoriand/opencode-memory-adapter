import { homedir } from "node:os";
import { join } from "node:path";
import type { Mem0Config } from "../types.js";

const DEFAULT_MEM0_DATA_DIR = join(homedir(), ".local", "share", "opencode-memory-adapter", "mem0");

export function getDefaultMem0DataDir(): string {
  return DEFAULT_MEM0_DATA_DIR;
}

export function getDefaultMem0Config(): Required<Mem0Config> {
  return {
    ollamaBaseUrl: "http://localhost:11434",
    llmModel: "qwen2.5:7b",
    embedModel: "nomic-embed-text",
    historyDbPath: join(DEFAULT_MEM0_DATA_DIR, "history.db"),
    vectorStoreProvider: "memory",
    vectorStorePath: join(DEFAULT_MEM0_DATA_DIR, "vector_store.db"),
    vectorStoreUrl: null,
    vectorStoreApiKey: null,
    collectionName: "opencode-memory-adapter",
  };
}
