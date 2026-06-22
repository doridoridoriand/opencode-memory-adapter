import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getDefaultMem0Config } from "./providers/mem0-defaults.js";
import type { MemoryPluginConfig, MemoryProviderName } from "./types.js";

const GLOBAL_CONFIG_PATH = join(homedir(), ".config", "opencode-memory-adapter", "config.json");
const PROJECT_CONFIG_FILENAME = ".opencode-memory-adapter.json";

const DEFAULT_CONFIG: MemoryPluginConfig = {
  provider: "mem0",
  scope: "global",
  mem0: getDefaultMem0Config(),
};

function readJsonFile(path: string): object | null {
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function interpolateEnv(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
  }
  if (Array.isArray(obj)) {
    return obj.map(interpolateEnv);
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnv(value);
    }
    return result;
  }
  return obj;
}

export function loadConfig(worktree: string): MemoryPluginConfig {
  const globalConfig = readJsonFile(GLOBAL_CONFIG_PATH) as MemoryPluginConfig | null;
  const projectConfig = readJsonFile(join(worktree, PROJECT_CONFIG_FILENAME)) as MemoryPluginConfig | null;

  const merged = { ...DEFAULT_CONFIG, ...globalConfig, ...projectConfig };

  if (!VALID_PROVIDERS.includes(merged.provider as MemoryProviderName)) {
    merged.provider = DEFAULT_CONFIG.provider;
  }

  if (merged.provider === "mem0") {
    merged.mem0 = { ...DEFAULT_CONFIG.mem0, ...globalConfig?.mem0, ...projectConfig?.mem0 };
  } else if (merged.provider === "honcho") {
    merged.honcho = { ...globalConfig?.honcho, ...projectConfig?.honcho };
  } else if (merged.provider === "openviking") {
    merged.openviking = { ...globalConfig?.openviking, ...projectConfig?.openviking };
  }

  return interpolateEnv(merged) as MemoryPluginConfig;
}

export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_PATH;
}

const VALID_PROVIDERS: MemoryProviderName[] = ["mem0", "honcho", "openviking"];
