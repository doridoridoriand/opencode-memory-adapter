#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function run(cmd, args, options = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : "";
    const stderr = error.stderr ? String(error.stderr) : "";
    throw new Error(
      `Command failed: ${cmd} ${args.join(" ")}\n` +
        `${stdout ? `stdout:\n${stdout}\n` : ""}` +
        `${stderr ? `stderr:\n${stderr}` : ""}`
    );
  }
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

function parseRequestBody(chunks) {
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length > 0 ? JSON.parse(raw) : {};
}

function createChatCompletionResponse(model, content) {
  return {
    id: "chatcmpl-smoke",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  };
}

async function startMockOpenAIServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = parseRequestBody(chunks);
    requests.push({
      method: req.method,
      url: req.url,
      body,
    });

    res.setHeader("content-type", "application/json");

    if (req.method === "POST" && req.url === "/v1/embeddings") {
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      const data = inputs.map((input, index) => ({
        object: "embedding",
        embedding: makeEmbedding(String(input ?? "")),
        index,
      }));
      res.end(
        JSON.stringify({
          object: "list",
          data,
          model: body.model ?? "smoke-embedder",
          usage: {
            prompt_tokens: inputs.length,
            total_tokens: inputs.length,
          },
        })
      );
      return;
    }

    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const content = JSON.stringify({
        memory: [
          {
            text: "Smoke test memory",
            attributed_to: "user",
          },
        ],
      });
      res.end(JSON.stringify(createChatCompletionResponse(body.model ?? "smoke-llm", content)));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Unhandled route: ${req.method} ${req.url}` }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind mock OpenAI server.");
  }

  return {
    port: address.port,
    requests,
    async close() {
      server.close();
      await once(server, "close");
    },
  };
}

function createToolContext(worktree) {
  return {
    sessionID: "smoke-session",
    messageID: "smoke-message",
    agent: "smoke-agent",
    directory: worktree,
    worktree,
    abort: new AbortController().signal,
    metadata() {},
    async ask() {},
  };
}

async function main() {
  const repoRoot = process.cwd();
  const tempRoot = mkdtempSync(join(tmpdir(), "opencode-memory-smoke-"));
  const packDir = join(tempRoot, "pack");
  const consumerDir = join(tempRoot, "consumer");
  const worktree = join(consumerDir, "workspace");
  const storageDir = join(worktree, ".smoke");

  mkdirSync(packDir, { recursive: true });
  mkdirSync(worktree, { recursive: true });
  mkdirSync(storageDir, { recursive: true });

  const server = await startMockOpenAIServer();
  let hooks;

  try {
    console.log("[smoke] Packing plugin tarball");
    const tarballName = run("npm", ["pack", "--pack-destination", packDir], { cwd: repoRoot })
      .split(/\r?\n/)
      .at(-1);
    assert.ok(tarballName, "npm pack did not produce a tarball name.");

    console.log("[smoke] Installing packed plugin into a temp consumer project");
    writeFileSync(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          name: "opencode-memory-plugin-smoke",
          private: true,
          type: "module",
        },
        null,
        2
      )
    );

    run(
      "npm",
      [
        "install",
        "--silent",
        join(packDir, tarballName),
        "@opencode-ai/plugin",
        "mem0ai",
        "better-sqlite3",
      ],
      { cwd: consumerDir }
    );

    console.log("[smoke] Writing mem0 config");
    writeFileSync(
      join(worktree, ".opencode-memory.json"),
      JSON.stringify(
        {
          provider: "mem0",
          scope: "project",
          mem0: {
            ollamaBaseUrl: `http://127.0.0.1:${server.port}`,
            llmModel: "smoke-llm",
            embedModel: "nomic-embed-text",
            historyDbPath: join(storageDir, "history.db"),
            vectorStoreProvider: "memory",
            vectorStorePath: join(storageDir, "vector_store.db"),
            collectionName: "smoke-memory",
          },
        },
        null,
        2
      )
    );

    console.log("[smoke] Loading packaged plugin");
    const pluginModule = await import(
      pathToFileURL(join(consumerDir, "node_modules", "opencode-memory-plugin", "dist", "index.js"))
        .href
    );
    hooks = await pluginModule.default({
      directory: worktree,
      worktree,
    });

    assert.ok(hooks.tool, "Plugin did not expose any tools.");

    const context = createToolContext(worktree);

    console.log("[smoke] Storing a memory through the packaged plugin");
    const storeOutput = await hooks.tool["memory-store"].execute(
      {
        content: "Smoke test memory",
        category: "project",
      },
      context
    );
    const storedId = storeOutput.match(/Memory stored \(([^)]+)\)/)?.[1];
    assert.ok(storedId, `Could not parse stored memory ID from output:\n${storeOutput}`);

    console.log("[smoke] Recalling the stored memory");
    const recallOutput = await hooks.tool["memory-recall"].execute(
      {
        query: "Smoke test memory",
      },
      context
    );
    assert.match(recallOutput, /Smoke test memory/);

    console.log("[smoke] Listing stored memories");
    const listOutput = await hooks.tool["memory-list"].execute({}, context);
    assert.match(listOutput, /Smoke test memory/);
    assert.match(listOutput, new RegExp(storedId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    console.log("[smoke] Deleting the stored memory");
    const deleteOutput = await hooks.tool["memory-delete"].execute({ id: storedId }, context);
    assert.match(deleteOutput, /Memory deleted/);

    console.log("[smoke] Confirming the memory is gone");
    const emptyListOutput = await hooks.tool["memory-list"].execute({}, context);
    assert.match(emptyListOutput, /No memories found/);

    const embeddingCalls = server.requests.filter((request) => request.url === "/v1/embeddings");
    const completionCalls = server.requests.filter(
      (request) => request.url === "/v1/chat/completions"
    );
    assert.ok(embeddingCalls.length > 0, "The smoke test never hit the embeddings endpoint.");
    assert.ok(completionCalls.length > 0, "The smoke test never hit the chat completions endpoint.");

    console.log("[smoke] Success");
    console.log(
      JSON.stringify(
        {
          tarball: tarballName,
          storedId,
          embeddingCalls: embeddingCalls.length,
          completionCalls: completionCalls.length,
        },
        null,
        2
      )
    );
  } finally {
    try {
      await hooks?.dispose?.();
    } finally {
      await server.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error("[smoke] Failed");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
