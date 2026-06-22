import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(path: string, value: object): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function importConfigModule(homeDir: string) {
  vi.resetModules();
  vi.doMock("node:os", async () => {
    const actual = await vi.importActual<typeof import("node:os")>("node:os");
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });
  return import("../src/config.js");
}

afterEach(async () => {
  vi.doUnmock("node:os");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("loadConfig", () => {
  it("returns the default config when no config files exist", async () => {
    const homeDir = await makeTempDir("opencode-memory-home-");
    const worktree = await makeTempDir("opencode-memory-worktree-");
    const { getGlobalConfigPath, loadConfig } = await importConfigModule(homeDir);

    expect(getGlobalConfigPath()).toBe(
      join(homeDir, ".config", "opencode-memory", "config.json")
    );
    expect(loadConfig(worktree)).toEqual({
      provider: "mem0",
      scope: "global",
      mem0: {
        ollamaBaseUrl: "http://localhost:11434",
        llmModel: "qwen2.5:7b",
        embedModel: "nomic-embed-text",
        historyDbPath: join(homeDir, ".local", "share", "opencode-memory", "mem0", "history.db"),
        vectorStoreProvider: "memory",
        vectorStorePath: join(homeDir, ".local", "share", "opencode-memory", "mem0", "vector_store.db"),
        vectorStoreUrl: null,
        vectorStoreApiKey: null,
        collectionName: "opencode-memory",
      },
    });
  });

  it("merges mem0 config from global and project files and interpolates env vars", async () => {
    const homeDir = await makeTempDir("opencode-memory-home-");
    const worktree = await makeTempDir("opencode-memory-worktree-");
    vi.stubEnv("MEMORY_LLM_MODEL", "llama3.2:latest");
    vi.stubEnv("MEMORY_HISTORY_DB", "/tmp/history.sqlite");

    await writeJson(join(homeDir, ".config", "opencode-memory", "config.json"), {
      provider: "mem0",
      scope: "project",
      mem0: {
        llmModel: "${MEMORY_LLM_MODEL}",
      },
    });
    await writeJson(join(worktree, ".opencode-memory.json"), {
      mem0: {
        embedModel: "text-embed-local",
        historyDbPath: "${MEMORY_HISTORY_DB}",
      },
    });

    const { loadConfig } = await importConfigModule(homeDir);
    expect(loadConfig(worktree)).toEqual({
      provider: "mem0",
      scope: "project",
      mem0: {
        ollamaBaseUrl: "http://localhost:11434",
        llmModel: "llama3.2:latest",
        embedModel: "text-embed-local",
        historyDbPath: "/tmp/history.sqlite",
        vectorStoreProvider: "memory",
        vectorStorePath: join(homeDir, ".local", "share", "opencode-memory", "mem0", "vector_store.db"),
        vectorStoreUrl: null,
        vectorStoreApiKey: null,
        collectionName: "opencode-memory",
      },
    });
  });

  it("falls back to the default provider when an invalid provider is configured", async () => {
    const homeDir = await makeTempDir("opencode-memory-home-");
    const worktree = await makeTempDir("opencode-memory-worktree-");
    await writeJson(join(worktree, ".opencode-memory.json"), {
      provider: "not-a-provider",
      scope: "project",
    });

    const { loadConfig } = await importConfigModule(homeDir);
    const config = loadConfig(worktree);

    expect(config.provider).toBe("mem0");
    expect(config.scope).toBe("project");
    expect(config.mem0?.llmModel).toBe("qwen2.5:7b");
  });

  it("merges honcho config when honcho is selected", async () => {
    const homeDir = await makeTempDir("opencode-memory-home-");
    const worktree = await makeTempDir("opencode-memory-worktree-");
    vi.stubEnv("HONCHO_TEST_KEY", "honcho-secret");

    await writeJson(join(homeDir, ".config", "opencode-memory", "config.json"), {
      provider: "honcho",
      honcho: {
        apiKey: "${HONCHO_TEST_KEY}",
        baseUrl: "https://honcho.example.com",
      },
    });
    await writeJson(join(worktree, ".opencode-memory.json"), {
      honcho: {
        workspaceId: "workspace-local",
      },
    });

    const { loadConfig } = await importConfigModule(homeDir);
    const config = loadConfig(worktree);

    expect(config.provider).toBe("honcho");
    expect(config.honcho).toEqual({
      apiKey: "honcho-secret", // sensitive-scan: allow fixture value
      baseUrl: "https://honcho.example.com",
      workspaceId: "workspace-local",
    });
  });

  it("merges openviking config when openviking is selected", async () => {
    const homeDir = await makeTempDir("opencode-memory-home-");
    const worktree = await makeTempDir("opencode-memory-worktree-");
    vi.stubEnv("OPENVIKING_API_KEY", "ov-secret");

    await writeJson(join(homeDir, ".config", "opencode-memory", "config.json"), {
      provider: "openviking",
      openviking: {
        url: "http://openviking.local:1933",
      },
    });
    await writeJson(join(worktree, ".opencode-memory.json"), {
      openviking: {
        apiKey: "${OPENVIKING_API_KEY}",
      },
    });

    const { loadConfig } = await importConfigModule(homeDir);
    const config = loadConfig(worktree);

    expect(config.provider).toBe("openviking");
    expect(config.openviking).toEqual({
      url: "http://openviking.local:1933",
      apiKey: "ov-secret", // sensitive-scan: allow fixture value
    });
  });
});
