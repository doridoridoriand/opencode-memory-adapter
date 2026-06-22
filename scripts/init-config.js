#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_FILE = join(homedir(), ".config", "opencode-memory-adapter", "config.json");
const DEFAULT_MEM0_DATA_DIR = join(homedir(), ".local", "share", "opencode-memory-adapter", "mem0");

const DEFAULT_CONFIG = {
  provider: "mem0",
  scope: "global",
  mem0: {
    ollamaBaseUrl: "http://localhost:11434",
    llmModel: "qwen2.5:7b",
    embedModel: "nomic-embed-text",
    historyDbPath: join(DEFAULT_MEM0_DATA_DIR, "history.db"),
    vectorStoreProvider: "memory",
    vectorStorePath: join(DEFAULT_MEM0_DATA_DIR, "vector_store.db"),
    collectionName: "opencode-memory-adapter",
  },
  honcho: {
    apiKey: "${HONCHO_API_KEY}",
    baseUrl: "https://api.honcho.dev",
    workspaceId: "opencode-memory-adapter",
  },
  openviking: {
    url: "http://localhost:1933",
    apiKey: "${OPENVIKING_API_KEY}",
  },
};

function printUsage() {
  console.log("Usage: opencode-memory-adapter init");
}

function shouldInitialize(argv) {
  const command = argv[2];
  return command == null || command === "init";
}

function main() {
  if (!shouldInitialize(process.argv)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (existsSync(CONFIG_FILE)) {
    console.log("[opencode-memory-adapter] Config already exists at", CONFIG_FILE);
    return;
  }

  try {
    mkdirSync(dirname(CONFIG_FILE), { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log("[opencode-memory-adapter] Created config at", CONFIG_FILE);
  } catch (err) {
    console.warn(
      "[opencode-memory-adapter] Failed to create config:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

main();
