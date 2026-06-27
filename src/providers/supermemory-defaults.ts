import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { SupermemoryConfig } from "../types.js";

export interface ResolvedSupermemoryConfig extends SupermemoryConfig {
  baseUrl: string;
  similarityThreshold: number;
  containerTagPrefix: string;
  globalContainerTag: string;
  projectContainerTag: string;
}

const DEFAULT_CONTAINER_TAG_PREFIX = "opencode-memory-adapter";
const DEFAULT_BASE_URL = "http://localhost:6767";
const DEFAULT_SIMILARITY_THRESHOLD = 0.6;

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function getDefaultSupermemoryConfig(worktree: string): ResolvedSupermemoryConfig {
  const normalizedWorktree = resolve(worktree);
  const userSeed = homedir();

  return {
    baseUrl: DEFAULT_BASE_URL,
    similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
    containerTagPrefix: DEFAULT_CONTAINER_TAG_PREFIX,
    globalContainerTag: `${DEFAULT_CONTAINER_TAG_PREFIX}_global_${shortHash(userSeed)}`,
    projectContainerTag: `${DEFAULT_CONTAINER_TAG_PREFIX}_project_${shortHash(normalizedWorktree)}`,
  };
}
