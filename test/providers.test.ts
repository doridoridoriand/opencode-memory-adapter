import { describe, it, expect, vi } from "vitest";
import { Mem0Provider } from "../src/providers/mem0-provider.js";
import { HonchoProvider } from "../src/providers/honcho-provider.js";
import { OpenVikingProvider } from "../src/providers/openviking-provider.js";
import { createProvider } from "../src/providers/index.js";
import { loadConfig } from "../src/config.js";

describe("createProvider", () => {
  it("creates mem0 provider by default", () => {
    const provider = createProvider({ provider: "mem0" });
    expect(provider).toBeDefined();
    expect(provider.constructor.name).toBe("Mem0Provider");
  });

  it("creates honcho provider", () => {
    const provider = createProvider({ provider: "honcho", honcho: { apiKey: "test" } });
    expect(provider).toBeDefined();
    expect(provider.constructor.name).toBe("HonchoProvider");
  });

  it("creates openviking provider", () => {
    const provider = createProvider({ provider: "openviking", openviking: {} });
    expect(provider).toBeDefined();
    expect(provider.constructor.name).toBe("OpenVikingProvider");
  });

  it("throws on unknown provider", () => {
    expect(() => createProvider({ provider: "unknown" as any })).toThrow("Unknown memory provider");
  });
});

describe("BaseMemoryProvider helpers", () => {
  it("filters by scope", () => {
    const p = new Mem0Provider();
    const results = [
      { id: "1", content: "a", metadata: { category: "conversation" as const, scope: "global" as const } },
      { id: "2", content: "b", metadata: { category: "conversation" as const, scope: "project" as const } },
    ];
    const filtered = p["filterByScope"](results, "global");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");
  });

  it("filters by category", () => {
    const p = new Mem0Provider();
    const results = [
      { id: "1", content: "a", metadata: { category: "conversation" as const } },
      { id: "2", content: "b", metadata: { category: "decision" as const } },
    ];
    const filtered = p["filterByCategory"](results, "conversation");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");
  });

  it("applies limit", () => {
    const p = new Mem0Provider();
    const results = [
      { id: "1", content: "a", metadata: { category: "conversation" as const } },
      { id: "2", content: "b", metadata: { category: "conversation" as const } },
      { id: "3", content: "c", metadata: { category: "conversation" as const } },
    ];
    const limited = p["applyLimit"](results, 2);
    expect(limited).toHaveLength(2);
  });
});

describe("loadConfig", () => {
  it("returns default config when no files exist", () => {
    const config = loadConfig("/nonexistent/path");
    expect(config.provider).toBe("mem0");
    expect(config.scope).toBe("global");
  });
});
