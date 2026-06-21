import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BaseMemoryProvider } from "./base.js";
import { normalizeMemoryMetadata } from "./metadata.js";
import type { ListOptions, MemoryMetadata, MemoryResult, OpenVikingConfig, SearchOptions } from "../types.js";

const RESOURCE_ROOT = "opencode-memory";
const RESOURCE_URI_PREFIX = "viking://resources/";
const METADATA_PREFIX = "<!-- opencode-memory:";
const METADATA_SUFFIX = " -->";

function toScopePath(scope?: string): string {
  return scope === "project" ? "project" : "global";
}

function toCategoryPath(category?: string): string {
  return category && category.length > 0 ? category : "conversation";
}

function buildResourceDirectory(scope?: string, category?: string): string {
  return `${RESOURCE_ROOT}/${toScopePath(scope)}/${toCategoryPath(category)}`;
}

function buildBasePath(scope?: string, category?: string): string {
  if (!scope) return RESOURCE_ROOT;
  if (!category) return `${RESOURCE_ROOT}/${toScopePath(scope)}`;
  return buildResourceDirectory(scope, category);
}

function buildResourceUri(path: string): string {
  return `${RESOURCE_URI_PREFIX}${path}`;
}

function stripResourceUri(uri: string): string {
  return uri.startsWith(RESOURCE_URI_PREFIX) ? uri.slice(RESOURCE_URI_PREFIX.length) : uri;
}

function isMemoryResourcePath(path: string): boolean {
  return path.startsWith(`${RESOURCE_ROOT}/`) && path.endsWith(".md");
}

function parseMetadataComment(line: string): Record<string, unknown> | null {
  if (!line.startsWith(METADATA_PREFIX) || !line.endsWith(METADATA_SUFFIX)) {
    return null;
  }

  try {
    return JSON.parse(line.slice(METADATA_PREFIX.length, -METADATA_SUFFIX.length));
  } catch {
    return null;
  }
}

function serializeMemoryContent(content: string, metadata: MemoryMetadata): string {
  return `${METADATA_PREFIX}${JSON.stringify(metadata)}${METADATA_SUFFIX}\n${content}`;
}

function parseStoredMemory(raw: string, fallback: Partial<MemoryMetadata>): {
  content: string;
  metadata: MemoryMetadata;
} {
  const newlineIndex = raw.indexOf("\n");
  const firstLine = newlineIndex >= 0 ? raw.slice(0, newlineIndex) : raw;
  const parsedMetadata = parseMetadataComment(firstLine);

  if (!parsedMetadata) {
    return {
      content: raw,
      metadata: normalizeMemoryMetadata({}, fallback),
    };
  }

  return {
    content: newlineIndex >= 0 ? raw.slice(newlineIndex + 1) : "",
    metadata: normalizeMemoryMetadata(parsedMetadata, fallback),
  };
}

function metadataFromResourcePath(path: string): MemoryMetadata {
  const parts = path.split("/");
  return normalizeMemoryMetadata({
    scope: parts[1],
    category: parts[2],
  });
}

function idFromResourcePath(path: string): string {
  return path.split("/").at(-1)?.replace(/\.md$/, "") ?? path;
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found/i.test(message);
}

export class OpenVikingProvider extends BaseMemoryProvider {
  private config: OpenVikingConfig;
  private sdk: any;

  constructor(config: OpenVikingConfig = {}) {
    super();
    this.config = config;
  }

  private async getSdk(): Promise<any> {
    if (this.sdk) return this.sdk;

    try {
      const mod = await import("@yfedberts/huscarl");
      const Huscarl = mod.Huscarl ?? mod.default;
      const client = new Huscarl({
        url: this.config.url ?? "http://localhost:1933",
        apiKey: this.config.apiKey,
        agentId: "opencode-memory-plugin",
      });
      await client.initialize();
      this.sdk = client;
      return this.sdk;
    } catch (error) {
      throw new Error(
        `Failed to load OpenViking provider. Ensure @yfedberts/huscarl is installed and OpenViking server is running.\n` +
          `Underlying error: ${(error as Error).message}`
      );
    }
  }

  private async ensureResourceDirectory(path: string): Promise<void> {
    const sdk = await this.getSdk();
    const segments = path.split("/");
    const dirs: string[] = [];

    for (const segment of segments) {
      dirs.push(segment);
      try {
        await sdk.resources.createDirectory(dirs.join("/"));
      } catch {
        // Directory creation is idempotent for our purposes.
      }
    }
  }

  private async readMemory(path: string, relevance?: number): Promise<MemoryResult> {
    const sdk = await this.getSdk();
    const raw = await sdk.resources.read(path);
    const fallback = metadataFromResourcePath(path);
    const parsed = parseStoredMemory(raw, fallback);

    return {
      id: idFromResourcePath(path),
      content: parsed.content,
      metadata: parsed.metadata,
      relevance,
    };
  }

  private async findPathById(id: string): Promise<string | null> {
    if (id.startsWith(RESOURCE_URI_PREFIX)) {
      return stripResourceUri(id);
    }

    if (id.startsWith(`${RESOURCE_ROOT}/`)) {
      return id;
    }

    const sdk = await this.getSdk();
    try {
      const entries = await sdk.resources.list(RESOURCE_ROOT, { recursive: true });
      const match = entries.find(
        (entry: { uri: string; isDir: boolean }) =>
          !entry.isDir && stripResourceUri(entry.uri).endsWith(`/${id}.md`)
      );
      return match ? stripResourceUri(match.uri) : null;
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async add(content: string, metadata: MemoryMetadata): Promise<{ id: string }> {
    const sdk = await this.getSdk();
    const id = randomUUID();
    const normalizedMetadata = normalizeMemoryMetadata({
      ...metadata,
      scope: metadata.scope ?? "global",
      tags: metadata.tags ?? [],
    });
    const targetDirectory = buildResourceDirectory(
      normalizedMetadata.scope,
      normalizedMetadata.category
    );
    const tempDir = await mkdtemp(join(tmpdir(), "opencode-memory-"));
    const filePath = join(tempDir, `${id}.md`);

    await writeFile(filePath, serializeMemoryContent(content, normalizedMetadata), "utf8");

    try {
      await this.ensureResourceDirectory(targetDirectory);
      await sdk.resources.add(filePath, {
        target: `${targetDirectory}/`,
        wait: true,
      });
      return { id };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async search(query: string, opts: SearchOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const targetPath = buildBasePath(opts.scope, opts.category);

    try {
      const result = await sdk.retrieval.find(query, {
        targetUri: buildResourceUri(targetPath),
        limit: opts.topK ?? 5,
      });

      const resources = Array.isArray(result?.resources)
        ? result.resources.filter((resource: { uri: string }) =>
            isMemoryResourcePath(stripResourceUri(resource.uri))
          )
        : [];

      const memories = await Promise.all(
        resources.map((resource: { uri: string; score?: number }) =>
          this.readMemory(stripResourceUri(resource.uri), resource.score)
        )
      );

      let filtered = this.filterByScope(memories, opts.scope);
      filtered = this.filterByCategory(filtered, opts.category);
      return this.applyLimit(filtered, opts.topK ?? 5);
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const sdk = await this.getSdk();
    const path = await this.findPathById(id);
    if (!path) return;
    await sdk.resources.remove(path);
  }

  async list(opts: ListOptions): Promise<MemoryResult[]> {
    const sdk = await this.getSdk();
    const basePath = buildBasePath(opts.scope, opts.category);

    try {
      const entries = await sdk.resources.list(basePath, { recursive: true });
      const files = entries
        .filter((entry: { isDir: boolean; uri: string }) => !entry.isDir)
        .map((entry: { uri: string; modTime: string }) => ({
          path: stripResourceUri(entry.uri),
          modTime: entry.modTime,
        }))
        .filter((entry: { path: string }) => isMemoryResourcePath(entry.path))
        .sort(
          (left: { modTime: string }, right: { modTime: string }) =>
            Date.parse(right.modTime) - Date.parse(left.modTime)
        );

      const memories = await Promise.all(
        files.map((entry: { path: string }) => this.readMemory(entry.path))
      );

      let filtered = this.filterByScope(memories, opts.scope);
      filtered = this.filterByCategory(filtered, opts.category);
      return this.applyLimit(filtered, opts.limit ?? 50);
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw error;
    }
  }

  async summarize(sessionId?: string): Promise<string> {
    const memories = await this.search("recent conversation summary", { topK: 10 });
    return memories.map((memory) => `[${memory.metadata.category}] ${memory.content}`).join("\n");
  }

  dispose(): void {
    this.sdk?.close?.();
    this.sdk = undefined;
  }
}
