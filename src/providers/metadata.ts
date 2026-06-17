import type { MemoryCategory, MemoryMetadata, MemoryScope } from "../types.js";

const MEMORY_CATEGORIES: ReadonlySet<MemoryCategory> = new Set([
  "conversation",
  "project",
  "preference",
  "decision",
]);

const MEMORY_SCOPES: ReadonlySet<MemoryScope> = new Set(["global", "project"]);

export function isMemoryCategory(value: unknown): value is MemoryCategory {
  return typeof value === "string" && MEMORY_CATEGORIES.has(value as MemoryCategory);
}

export function isMemoryScope(value: unknown): value is MemoryScope {
  return typeof value === "string" && MEMORY_SCOPES.has(value as MemoryScope);
}

export function normalizeMemoryMetadata(
  metadata: Record<string, unknown> = {},
  fallback: Partial<MemoryMetadata> = {}
): MemoryMetadata {
  const tags =
    Array.isArray(metadata.tags) && metadata.tags.every((tag) => typeof tag === "string")
      ? [...metadata.tags]
      : Array.isArray(fallback.tags)
        ? [...fallback.tags]
        : undefined;

  return {
    ...fallback,
    ...metadata,
    category: isMemoryCategory(metadata.category)
      ? metadata.category
      : fallback.category ?? "conversation",
    scope: isMemoryScope(metadata.scope) ? metadata.scope : fallback.scope ?? "global",
    ...(tags ? { tags } : {}),
  };
}
