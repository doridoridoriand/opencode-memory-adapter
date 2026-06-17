import { getConfig } from "../memory-singleton.js";
import type { MemoryScope } from "../types.js";

export function resolveScope(scope?: MemoryScope): MemoryScope {
  return scope ?? getConfig().scope ?? "global";
}
