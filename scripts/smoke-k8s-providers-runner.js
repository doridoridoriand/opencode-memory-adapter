#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

function createToolContext(worktree) {
  return {
    sessionID: "k8s-smoke-session",
    messageID: "k8s-smoke-message",
    agent: "k8s-smoke-agent",
    directory: worktree,
    worktree,
    abort: new AbortController().signal,
    metadata() {},
    async ask() {},
  };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  return response.json();
}

async function resetDebugState(baseUrl, segment) {
  await requestJson(`${baseUrl}/${segment}/debug/reset`, { method: "POST" });
}

async function loadPlugin(consumerDir) {
  return import(
    pathToFileURL(
      join(consumerDir, "node_modules", "opencode-memory-adapter", "dist", "index.js")
    )
      .href
  );
}

async function runMem0Test(pluginModule, worktree, baseUrl) {
  console.log("[k8s-smoke] Testing mem0 provider");
  const storageDir = join(worktree, ".mem0");
  mkdirSync(storageDir, { recursive: true });

  writeFileSync(
    join(worktree, ".opencode-memory-adapter.json"),
    JSON.stringify(
      {
        provider: "mem0",
        scope: "project",
        mem0: {
          ollamaBaseUrl: `${baseUrl}/openai`,
          llmModel: "mock-llm",
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

  await resetDebugState(baseUrl, "openai");
  const hooks = await pluginModule.default({
    directory: worktree,
    worktree,
  });

  try {
    const context = createToolContext(worktree);
    const storeOutput = await hooks.tool["memory-store"].execute(
      {
        content: "Smoke test memory",
        category: "project",
      },
      context
    );
    const storedId = storeOutput.match(/Memory stored \(([^)]+)\)/)?.[1];
    assert.ok(storedId, `Could not parse mem0 memory id:\n${storeOutput}`);

    const recallOutput = await hooks.tool["memory-recall"].execute(
      {
        query: "Smoke test memory",
      },
      context
    );
    assert.match(recallOutput, /Smoke test memory/);

    const listOutput = await hooks.tool["memory-list"].execute({}, context);
    assert.match(listOutput, /Smoke test memory/);
    assert.match(listOutput, new RegExp(escapeRegex(storedId)));

    const vectorStorePath = join(storageDir, "vector_store.db");
    const historyDbPath = join(storageDir, "history.db");
    assert.ok(existsSync(vectorStorePath), "mem0 vector_store.db was not created");
    assert.ok(statSync(vectorStorePath).size > 0, "mem0 vector_store.db is empty");
    assert.ok(existsSync(historyDbPath), "mem0 history.db was not created");

    const deleteOutput = await hooks.tool["memory-delete"].execute({ id: storedId }, context);
    assert.match(deleteOutput, /Memory deleted/);

    const emptyListOutput = await hooks.tool["memory-list"].execute({}, context);
    assert.match(emptyListOutput, /No memories found/);

    const openAiState = await requestJson(`${baseUrl}/openai/debug/state`);
    assert.ok(openAiState.embeddings.length > 0, "mem0 did not call embeddings endpoint");
    assert.ok(openAiState.chatCompletions.length > 0, "mem0 did not call chat completions");

    return {
      provider: "mem0",
      storedId,
      vectorStorePath,
      historyDbPath,
      embeddings: openAiState.embeddings.length,
      chatCompletions: openAiState.chatCompletions.length,
    };
  } finally {
    await hooks.dispose?.();
  }
}

async function runHonchoTest(pluginModule, worktree, baseUrl) {
  console.log("[k8s-smoke] Testing honcho provider");
  writeFileSync(
    join(worktree, ".opencode-memory-adapter.json"),
    JSON.stringify(
      {
        provider: "honcho",
        scope: "project",
        honcho: {
          baseUrl: `${baseUrl}/honcho`,
          workspaceId: "k8s-smoke",
        },
      },
      null,
      2
    )
  );

  await resetDebugState(baseUrl, "honcho");
  const hooks = await pluginModule.default({
    directory: worktree,
    worktree,
  });

  try {
    const context = createToolContext(worktree);
    const storeOutput = await hooks.tool["memory-store"].execute(
      {
        content: "Kubernetes honcho memory",
        category: "decision",
      },
      context
    );
    const storedId = storeOutput.match(/Memory stored \(([^)]+)\)/)?.[1];
    assert.ok(storedId, `Could not parse honcho memory id:\n${storeOutput}`);

    const stateAfterAdd = await requestJson(`${baseUrl}/honcho/debug/state`);
    assert.equal(stateAfterAdd.workspaces.length, 1, "honcho workspace was not created");
    assert.equal(stateAfterAdd.workspaces[0].sessions.length, 1, "honcho session was not created");
    assert.equal(
      stateAfterAdd.workspaces[0].sessions[0].messages.length,
      1,
      "honcho message was not stored"
    );

    const recallOutput = await hooks.tool["memory-recall"].execute(
      {
        query: "honcho",
      },
      context
    );
    assert.match(recallOutput, /Kubernetes honcho memory/);

    const listOutput = await hooks.tool["memory-list"].execute({}, context);
    assert.match(listOutput, /Kubernetes honcho memory/);
    assert.match(listOutput, new RegExp(escapeRegex(storedId)));

    const deleteOutput = await hooks.tool["memory-delete"].execute({ id: storedId }, context);
    assert.match(deleteOutput, /Memory deleted/);

    const stateAfterDelete = await requestJson(`${baseUrl}/honcho/debug/state`);
    assert.equal(
      stateAfterDelete.workspaces[0].sessions.length,
      0,
      "honcho session was not deleted"
    );

    return {
      provider: "honcho",
      storedId,
      sessionsAfterAdd: stateAfterAdd.workspaces[0].sessions.length,
    };
  } finally {
    await hooks.dispose?.();
  }
}

async function runOpenVikingTest(pluginModule, worktree, baseUrl) {
  console.log("[k8s-smoke] Testing openviking provider");
  writeFileSync(
    join(worktree, ".opencode-memory-adapter.json"),
    JSON.stringify(
      {
        provider: "openviking",
        scope: "project",
        openviking: {
          url: `${baseUrl}/openviking`,
        },
      },
      null,
      2
    )
  );

  await resetDebugState(baseUrl, "openviking");
  const hooks = await pluginModule.default({
    directory: worktree,
    worktree,
  });

  try {
    const context = createToolContext(worktree);
    const storeOutput = await hooks.tool["memory-store"].execute(
      {
        content: "Kubernetes openviking memory",
        category: "project",
      },
      context
    );
    const storedId = storeOutput.match(/Memory stored \(([^)]+)\)/)?.[1];
    assert.ok(storedId, `Could not parse openviking memory id:\n${storeOutput}`);

    const stateAfterAdd = await requestJson(`${baseUrl}/openviking/debug/state`);
    assert.equal(stateAfterAdd.files.length, 1, "openviking file was not stored");
    assert.match(stateAfterAdd.files[0].content, /Kubernetes openviking memory/);

    const recallOutput = await hooks.tool["memory-recall"].execute(
      {
        query: "openviking",
      },
      context
    );
    assert.match(recallOutput, /Kubernetes openviking memory/);

    const listOutput = await hooks.tool["memory-list"].execute({}, context);
    assert.match(listOutput, /Kubernetes openviking memory/);
    assert.match(listOutput, new RegExp(escapeRegex(storedId)));

    const deleteOutput = await hooks.tool["memory-delete"].execute({ id: storedId }, context);
    assert.match(deleteOutput, /Memory deleted/);

    const stateAfterDelete = await requestJson(`${baseUrl}/openviking/debug/state`);
    assert.equal(stateAfterDelete.files.length, 0, "openviking file was not deleted");

    return {
      provider: "openviking",
      storedId,
      fileCountAfterAdd: stateAfterAdd.files.length,
    };
  } finally {
    await hooks.dispose?.();
  }
}

async function main() {
  const tarball = process.argv[2];
  if (!tarball) {
    throw new Error("Usage: node scripts/smoke-k8s-providers-runner.js <plugin-tarball>");
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "opencode-memory-adapter-k8s-smoke-"));
  const consumerDir = join(tempRoot, "consumer");
  const worktreeRoot = join(tempRoot, "workspace");
  const baseUrl = "http://127.0.0.1:8080";

  mkdirSync(consumerDir, { recursive: true });
  mkdirSync(worktreeRoot, { recursive: true });

  try {
    writeFileSync(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          name: "opencode-memory-adapter-k8s-smoke",
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
        tarball,
        "@opencode-ai/plugin",
        "mem0ai",
        "better-sqlite3",
        "@honcho-ai/sdk",
        "@yfedberts/huscarl",
      ],
      { cwd: consumerDir }
    );

    const pluginModule = await loadPlugin(consumerDir);
    const results = [];

    const mem0Worktree = join(worktreeRoot, "mem0");
    mkdirSync(mem0Worktree, { recursive: true });
    results.push(await runMem0Test(pluginModule, mem0Worktree, baseUrl));

    const honchoWorktree = join(worktreeRoot, "honcho");
    mkdirSync(honchoWorktree, { recursive: true });
    results.push(await runHonchoTest(pluginModule, honchoWorktree, baseUrl));

    const openVikingWorktree = join(worktreeRoot, "openviking");
    mkdirSync(openVikingWorktree, { recursive: true });
    results.push(await runOpenVikingTest(pluginModule, openVikingWorktree, baseUrl));

    console.log("[k8s-smoke] Success");
    console.log(JSON.stringify({ tarball, results }, null, 2));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[k8s-smoke] Failed");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
