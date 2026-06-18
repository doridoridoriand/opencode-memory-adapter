import { describe, expect, it } from "vitest";
import {
  isMemoryCategory,
  isMemoryScope,
  normalizeMemoryMetadata,
} from "../src/providers/metadata.js";

describe("memory metadata helpers", () => {
  it("recognizes valid categories and scopes", () => {
    expect(isMemoryCategory("project")).toBe(true);
    expect(isMemoryCategory("invalid")).toBe(false);
    expect(isMemoryScope("global")).toBe(true);
    expect(isMemoryScope("local")).toBe(false);
  });

  it("falls back to provided metadata defaults when values are invalid", () => {
    expect(
      normalizeMemoryMetadata(
        {
          category: "invalid",
          scope: "invalid",
          tags: ["valid", 1] as unknown as string[],
        },
        {
          category: "decision",
          scope: "project",
          tags: ["fallback"],
          source: "fallback-source",
        }
      )
    ).toEqual({
      category: "decision",
      scope: "project",
      tags: ["fallback"],
      source: "fallback-source",
    });
  });
});
