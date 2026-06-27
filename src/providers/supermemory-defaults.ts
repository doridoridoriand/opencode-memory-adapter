import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { SupermemoryConfig } from "../types.js";

export interface ResolvedSupermemoryConfig extends SupermemoryConfig {
  apiKey?: string;
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

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getDefaultSupermemoryConfig(
  worktree: string,
  overrides: SupermemoryConfig = {}
): ResolvedSupermemoryConfig {
  const normalizedWorktree = resolve(worktree);
  const userSeed = homedir();
  const containerTagPrefix =
    normalizeOptionalString(overrides.containerTagPrefix) ?? DEFAULT_CONTAINER_TAG_PREFIX;

  return {
    apiKey: normalizeOptionalString(overrides.apiKey),
    baseUrl: normalizeOptionalString(overrides.baseUrl) ?? DEFAULT_BASE_URL,
    similarityThreshold: overrides.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
    containerTagPrefix,
    globalContainerTag:
      normalizeOptionalString(overrides.globalContainerTag) ??
      `${containerTagPrefix}_global_${shortHash(userSeed)}`,
    projectContainerTag:
      normalizeOptionalString(overrides.projectContainerTag) ??
      `${containerTagPrefix}_project_${shortHash(normalizedWorktree)}`,
  };
}
