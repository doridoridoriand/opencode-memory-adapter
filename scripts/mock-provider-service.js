#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { createServer } from "node:http";

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw.length > 0 ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normalizePathname(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

function hashText(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeEmbedding(text) {
  const seed = hashText(text);
  return Array.from({ length: 768 }, (_, index) => {
    const value = (seed + index * 2654435761) >>> 0;
    return (value % 1000) / 1000;
  });
}

function nowIso() {
  return new Date().toISOString();
}

function createOpenAIState() {
  return {
    embeddings: [],
    chatCompletions: [],
  };
}

function createHonchoState() {
  return {
    workspaces: new Map(),
    requests: {
      searches: [],
      sessionLists: [],
    },
  };
}

function createOpenVikingState() {
  return {
    directories: new Map(),
    files: new Map(),
  };
}

const state = {
  openai: createOpenAIState(),
  honcho: createHonchoState(),
  openviking: createOpenVikingState(),
};

function resetOpenAI() {
  state.openai = createOpenAIState();
}

function resetHoncho() {
  state.honcho = createHonchoState();
}

function resetOpenViking() {
  state.openviking = createOpenVikingState();
}

function ensureHonchoWorkspace(id, metadata = {}, configuration = undefined) {
  let workspace = state.honcho.workspaces.get(id);
  if (!workspace) {
    workspace = {
      id,
      metadata: metadata ?? {},
      configuration,
      created_at: nowIso(),
      peers: new Map(),
      sessions: new Map(),
    };
    state.honcho.workspaces.set(id, workspace);
  } else {
    if (metadata != null) workspace.metadata = metadata;
    if (configuration !== undefined) workspace.configuration = configuration;
  }
  return workspace;
}

function ensureHonchoPeer(workspace, id, metadata = {}, configuration = undefined) {
  let peer = workspace.peers.get(id);
  if (!peer) {
    peer = {
      id,
      metadata: metadata ?? {},
      configuration,
      created_at: nowIso(),
    };
    workspace.peers.set(id, peer);
  } else {
    if (metadata != null) peer.metadata = metadata;
    if (configuration !== undefined) peer.configuration = configuration;
  }
  return peer;
}

function ensureHonchoSession(workspace, id, metadata = {}, configuration = undefined) {
  let session = workspace.sessions.get(id);
  if (!session) {
    session = {
      id,
      metadata: metadata ?? {},
      configuration,
      created_at: nowIso(),
      is_active: true,
      peers: new Set(),
      messages: [],
    };
    workspace.sessions.set(id, session);
  } else {
    if (metadata != null) session.metadata = metadata;
    if (configuration !== undefined) session.configuration = configuration;
  }
  return session;
}

function matchesMetadataFilters(metadata, filters) {
  if (!filters) return true;
  return Object.entries(filters).every(([key, value]) => {
    if (key === "$and" || key === "AND") {
      return Array.isArray(value) && value.every((item) => matchesMetadataFilters(metadata, item));
    }

    if (key === "$or" || key === "OR") {
      return Array.isArray(value) && value.some((item) => matchesMetadataFilters(metadata, item));
    }

    if (key === "$not" || key === "NOT") {
      return Array.isArray(value) && value.every((item) => !matchesMetadataFilters(metadata, item));
    }

    const fieldValue = metadata?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("eq" in value) return fieldValue === value.eq;
      if ("in" in value) return Array.isArray(value.in) && value.in.includes(fieldValue);
      if ("contains" in value) {
        return typeof fieldValue === "string" && fieldValue.includes(String(value.contains));
      }
      return false;
    }

    if (Array.isArray(value)) {
      return value.includes(fieldValue);
    }

    return fieldValue === value;
  });
}

function unwrapHonchoMetadataFilters(filters) {
  if (!filters || typeof filters !== "object") return undefined;
  const metadata = filters.metadata;
  return metadata && typeof metadata === "object" ? metadata : undefined;
}

function paginate(items, query) {
  const page = Number.parseInt(String(query.get("page") ?? "1"), 10) || 1;
  const size = Number.parseInt(String(query.get("size") ?? "50"), 10) || 50;
  const reverse = query.get("reverse") === "true";
  const ordered = reverse ? [...items].reverse() : [...items];
  const start = (page - 1) * size;
  const pageItems = ordered.slice(start, start + size);
  const pages = ordered.length === 0 ? 1 : Math.ceil(ordered.length / size);
  return {
    items: pageItems,
    page,
    size,
    pages,
    total: ordered.length,
  };
}

function ensureOpenVikingDirectory(path) {
  if (!path) return;
  const normalized = path.replace(/^\/+|\/+$/g, "");
  if (!normalized) return;

  const segments = normalized.split("/");
  const parts = [];
  for (const segment of segments) {
    parts.push(segment);
    const currentPath = parts.join("/");
    if (!state.openviking.directories.has(currentPath)) {
      state.openviking.directories.set(currentPath, {
        path: currentPath,
        uri: `viking://resources/${currentPath}`,
        name: segment,
        modTime: nowIso(),
      });
    }
  }
}

function parseVikingResourcePath(uri) {
  return uri.replace(/^viking:\/\/resources\//, "").replace(/^\/+|\/+$/g, "");
}

function buildOpenVikingListEntry(path, isDir, modTime, size = 0) {
  return {
    name: basename(path),
    size,
    mode: isDir ? 16877 : 33188,
    modTime,
    isDir,
    uri: `viking://resources/${path}`,
  };
}

function findOpenVikingFiles(targetPath) {
  return [...state.openviking.files.values()].filter((file) =>
    targetPath.length === 0 ? true : file.path.startsWith(`${targetPath}/`) || file.path === targetPath
  );
}

function serializeHonchoState() {
  return {
    requests: state.honcho.requests,
    workspaces: [...state.honcho.workspaces.values()].map((workspace) => ({
      id: workspace.id,
      metadata: workspace.metadata,
      peers: [...workspace.peers.values()],
      sessions: [...workspace.sessions.values()].map((session) => ({
        id: session.id,
        metadata: session.metadata,
        peers: [...session.peers.values()],
        messages: session.messages,
      })),
    })),
  };
}

function serializeOpenVikingState() {
  return {
    directories: [...state.openviking.directories.values()],
    files: [...state.openviking.files.values()],
  };
}

async function handleOpenAI(req, res, pathname) {
  if (req.method === "POST" && pathname === "/openai/debug/reset") {
    resetOpenAI();
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && pathname === "/openai/debug/state") {
    json(res, 200, state.openai);
    return true;
  }

  if (req.method === "POST" && pathname === "/openai/v1/embeddings") {
    const body = await readBody(req);
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    state.openai.embeddings.push(body);
    json(res, 200, {
      object: "list",
      data: inputs.map((input, index) => ({
        object: "embedding",
        embedding: makeEmbedding(String(input ?? "")),
        index,
      })),
      model: body.model ?? "mock-embedder",
      usage: {
        prompt_tokens: inputs.length,
        total_tokens: inputs.length,
      },
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/openai/v1/chat/completions") {
    const body = await readBody(req);
    state.openai.chatCompletions.push(body);
    json(res, 200, {
      id: "chatcmpl-k8s-smoke",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? "mock-llm",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              memory: [
                {
                  text: "Smoke test memory",
                  attributed_to: "user",
                },
              ],
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    });
    return true;
  }

  return false;
}

async function handleHoncho(req, res, pathname, url) {
  if (req.method === "POST" && pathname === "/honcho/debug/reset") {
    resetHoncho();
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && pathname === "/honcho/debug/state") {
    json(res, 200, serializeHonchoState());
    return true;
  }

  const rawSegments = pathname.split("/").filter(Boolean);
  const segments =
    rawSegments[0] === "honcho" ? rawSegments.slice(1) : rawSegments;
  if (segments[0] !== "v3") {
    return false;
  }

  if (req.method === "POST" && segments.length === 2 && segments[1] === "workspaces") {
    const body = await readBody(req);
    const workspace = ensureHonchoWorkspace(body.id, body.metadata, body.configuration);
    json(res, 200, {
      id: workspace.id,
      metadata: workspace.metadata,
      configuration: workspace.configuration,
      created_at: workspace.created_at,
    });
    return true;
  }

  if (segments[1] !== "workspaces" || !segments[2]) {
    return false;
  }

  const workspace = ensureHonchoWorkspace(segments[2]);

  if (req.method === "POST" && segments.length === 4 && segments[3] === "search") {
    const body = await readBody(req);
    const query = String(body.query ?? "").toLowerCase();
    const limit = Number(body.limit ?? 10);
    state.honcho.requests.searches.push({
      query: body.query ?? "",
      filters: body.filters ?? null,
      limit,
    });
    const messages = [...workspace.sessions.values()]
      .flatMap((session) =>
        session.messages.map((message) => ({
          message,
          sessionMetadata: session.metadata,
        }))
      )
      .filter(
        ({ message, sessionMetadata }) =>
          matchesMetadataFilters(
            message.metadata ?? sessionMetadata,
            unwrapHonchoMetadataFilters(body.filters)
          ) &&
          (query.length === 0 || message.content.toLowerCase().includes(query))
      )
      .map(({ message }) => message)
      .slice(0, limit);
    json(res, 200, messages);
    return true;
  }

  if (req.method === "POST" && segments.length === 5 && segments[3] === "peers" && segments[4] === "list") {
    const body = await readBody(req);
    const peers = [...workspace.peers.values()].filter((peer) =>
      matchesMetadataFilters(peer.metadata, body.filters)
    );
    json(res, 200, paginate(peers, url.searchParams));
    return true;
  }

  if (req.method === "POST" && segments.length === 4 && segments[3] === "peers") {
    const body = await readBody(req);
    const peer = ensureHonchoPeer(workspace, body.id, body.metadata, body.configuration);
    json(res, 200, peer);
    return true;
  }

  if (req.method === "POST" && segments.length === 5 && segments[3] === "sessions" && segments[4] === "list") {
    const body = await readBody(req);
    state.honcho.requests.sessionLists.push({
      filters: body.filters ?? null,
      page: url.searchParams.get("page"),
      size: url.searchParams.get("size"),
      reverse: url.searchParams.get("reverse"),
    });
    const sessions = [...workspace.sessions.values()].filter((session) => {
      const latestMessage = session.messages.at(-1);
      const metadataFilters = unwrapHonchoMetadataFilters(body.filters);
      return matchesMetadataFilters(session.metadata, metadataFilters) ||
        matchesMetadataFilters(latestMessage?.metadata, metadataFilters);
    });
    json(
      res,
      200,
      paginate(
        sessions.map((session) => ({
          id: session.id,
          metadata: session.metadata,
          configuration: session.configuration,
          created_at: session.created_at,
          is_active: session.is_active,
        })),
        url.searchParams
      )
    );
    return true;
  }

  if (req.method === "POST" && segments.length === 4 && segments[3] === "sessions") {
    const body = await readBody(req);
    const session = ensureHonchoSession(workspace, body.id, body.metadata, body.configuration);
    json(res, 200, {
      id: session.id,
      metadata: session.metadata,
      configuration: session.configuration,
      created_at: session.created_at,
      is_active: session.is_active,
    });
    return true;
  }

  if (segments[3] !== "sessions" || !segments[4]) {
    return false;
  }

  const session = ensureHonchoSession(workspace, segments[4]);

  if (req.method === "DELETE" && segments.length === 5) {
    workspace.sessions.delete(session.id);
    json(res, 200, { id: session.id });
    return true;
  }

  if (req.method === "POST" && segments.length === 6 && segments[5] === "peers") {
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && segments.length === 6 && segments[5] === "messages") {
    const body = await readBody(req);
    const created = Array.isArray(body.messages)
      ? body.messages.map((message) => {
          const createdMessage = {
            id: randomUUID(),
            content: String(message.content ?? ""),
            peer_id: String(message.peer_id ?? "unknown-peer"),
            session_id: session.id,
            workspace_id: workspace.id,
            metadata: message.metadata ?? {},
            created_at: message.created_at ?? nowIso(),
            token_count: String(message.content ?? "").length,
          };
          session.messages.push(createdMessage);
          return createdMessage;
        })
      : [];
    json(res, 200, created);
    return true;
  }

  if (req.method === "POST" && segments.length === 7 && segments[5] === "messages" && segments[6] === "list") {
    const body = await readBody(req);
    const messages = session.messages.filter((message) =>
      matchesMetadataFilters(message.metadata, body.filters)
    );
    json(res, 200, paginate(messages, url.searchParams));
    return true;
  }

  return false;
}

async function handleOpenViking(req, res, pathname, url) {
  if (req.method === "GET" && pathname === "/openviking/health") {
    res.statusCode = 200;
    res.end("ok");
    return true;
  }

  if (req.method === "POST" && pathname === "/openviking/debug/reset") {
    resetOpenViking();
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && pathname === "/openviking/debug/state") {
    json(res, 200, serializeOpenVikingState());
    return true;
  }

  const apiPath = pathname.replace(/^\/openviking/, "");
  if (!apiPath.startsWith("/api/v1")) {
    return false;
  }

  if (req.method === "POST" && apiPath === "/api/v1/fs/mkdir") {
    const body = await readBody(req);
    ensureOpenVikingDirectory(parseVikingResourcePath(body.uri));
    json(res, 200, { status: "ok", result: { uri: body.uri } });
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/v1/resources") {
    const body = await readBody(req);
    const targetDir = parseVikingResourcePath(String(body.target ?? "viking://resources/"));
    ensureOpenVikingDirectory(targetDir);

    if (!existsSync(body.path)) {
      json(res, 404, {
        status: "error",
        error: {
          code: "NOT_FOUND",
          message: `File not found: ${body.path}`,
        },
      });
      return true;
    }

    const content = readFileSync(body.path, "utf8");
    const destinationPath = [targetDir, basename(body.path)].filter(Boolean).join("/");
    state.openviking.files.set(destinationPath, {
      path: destinationPath,
      content,
      uri: `viking://resources/${destinationPath}`,
      modTime: nowIso(),
    });
    json(res, 200, {
      status: "ok",
      result: {
        status: "ok",
        root_uri: `viking://resources/${targetDir}`,
        source_path: body.path,
        errors: [],
      },
    });
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/v1/content/read") {
    const path = parseVikingResourcePath(String(url.searchParams.get("uri") ?? ""));
    const file = state.openviking.files.get(path);
    if (!file) {
      json(res, 404, {
        status: "error",
        error: {
          code: "NOT_FOUND",
          message: `Resource not found: ${path}`,
        },
      });
      return true;
    }
    json(res, 200, { status: "ok", result: file.content });
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/v1/fs/ls") {
    const targetPath = parseVikingResourcePath(String(url.searchParams.get("uri") ?? ""));
    const recursive = url.searchParams.get("recursive") === "true";
    const entries = [];

    for (const directory of state.openviking.directories.values()) {
      if (targetPath.length > 0 && directory.path !== targetPath && !recursive) {
        if (dirname(directory.path) !== targetPath) continue;
      } else if (targetPath.length > 0 && recursive && !directory.path.startsWith(`${targetPath}/`) && directory.path !== targetPath) {
        continue;
      } else if (targetPath.length === 0 && !recursive && directory.path.includes("/")) {
        continue;
      }
      entries.push(buildOpenVikingListEntry(directory.path, true, directory.modTime));
    }

    for (const file of state.openviking.files.values()) {
      if (targetPath.length > 0 && !recursive) {
        if (dirname(file.path) !== targetPath) continue;
      } else if (targetPath.length > 0 && recursive && !file.path.startsWith(`${targetPath}/`) && file.path !== targetPath) {
        continue;
      } else if (targetPath.length === 0 && !recursive && file.path.includes("/")) {
        continue;
      }
      entries.push(buildOpenVikingListEntry(file.path, false, file.modTime, file.content.length));
    }

    json(res, 200, { status: "ok", result: entries });
    return true;
  }

  if (req.method === "DELETE" && apiPath === "/api/v1/fs") {
    const targetPath = parseVikingResourcePath(String(url.searchParams.get("uri") ?? ""));
    state.openviking.files.delete(targetPath);
    state.openviking.directories.delete(targetPath);
    json(res, 200, { status: "ok", result: { uri: `viking://resources/${targetPath}` } });
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/v1/search/find") {
    const body = await readBody(req);
    const targetPath = parseVikingResourcePath(String(body.target_uri ?? "viking://resources/"));
    const query = String(body.query ?? "").toLowerCase();
    const limit = Number(body.limit ?? 10);
    const resources = findOpenVikingFiles(targetPath)
      .filter(
        (file) =>
          query.length === 0 ||
          file.content.toLowerCase().includes(query) ||
          file.path.toLowerCase().includes(query)
      )
      .slice(0, limit)
      .map((file) => ({
        uri: file.uri,
        context_type: "resource",
        is_leaf: true,
        abstract: file.content.slice(0, 120),
        score: file.content.toLowerCase().includes(query) ? 0.99 : 0.75,
        match_reason: "mock semantic match",
      }));

    json(res, 200, {
      status: "ok",
      result: {
        memories: [],
        resources,
        skills: [],
        total: resources.length,
      },
    });
    return true;
  }

  return false;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:8080");
    const pathname = normalizePathname(url.pathname);

    if (await handleOpenAI(req, res, pathname)) return;
    if (await handleHoncho(req, res, pathname, url)) return;
    if (await handleOpenViking(req, res, pathname, url)) return;

    json(res, 404, {
      error: `Unhandled route: ${req.method ?? "GET"} ${pathname}`,
    });
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  }
});

server.listen(8080, "0.0.0.0", () => {
  console.log("[mock-provider-service] listening on :8080");
});
