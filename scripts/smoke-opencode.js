#!/usr/bin/env node

// Exercise the packed package through the installed V2 server, without an LLM
// or access to the user's memory backend or OpenCode configuration.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { runSmokeCommand } from "./smoke-process.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binary = process.env.OPENCODE_BIN || "opencode";
const version = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
assert.match(version, /v?2\./, "This smoke test requires OpenCode V2.");
const root = mkdtempSync(join(tmpdir(), "opencode-memory-native-"));
const consumer = join(root, "consumer");
const worktree = join(root, "worktree");
const reportFile = join(root, "report.json");
const requests = [];
const memories = new Map();
let sequence = 0;
let nativeServer;
let nativeLogs = "";

const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    requests.push({ method: req.method, path: req.url });
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/v4/memories") {
      const id = `native-smoke-${++sequence}`;
      const item = body.memories[0];
      memories.set(id, { id, memory: item.content, metadata: item.metadata, containerTag: body.containerTag });
      res.end(JSON.stringify({ memories: [{ id }] }));
    } else if (req.method === "POST" && req.url === "/v4/search") {
      res.end(JSON.stringify({ results: [...memories.values()].filter(m => m.containerTag === body.containerTag) }));
    } else if (req.method === "POST" && req.url === "/v4/memories/list") {
      res.end(JSON.stringify({ memoryEntries: [...memories.values()].filter(m => body.containerTags.includes(m.containerTag)), pagination: { totalPages: 1 } }));
    } else if (req.method === "DELETE" && req.url === "/v4/memories") {
      if (memories.get(body.id)?.containerTag !== body.containerTag) {
        res.statusCode = 404;
        res.end("{}");
      } else {
        memories.delete(body.id);
        res.end("{}");
      }
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(error) }));
  }
});

function run(args, cwd, env) {
  return runSmokeCommand(binary, args, { cwd, env });
}

try {
  for (const dir of [consumer, worktree, join(root, "config")]) mkdirSync(dir, { recursive: true });
  console.log(`[smoke] Testing ${version} with a packed consumer install`);
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", root], { cwd: repoRoot, encoding: "utf8" }));
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--omit=optional", "--ignore-scripts", "--no-audit", "--no-fund", join(root, packed[0].filename)], { cwd: consumer, stdio: "pipe" });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  writeFileSync(join(worktree, ".opencode-memory-adapter.json"), JSON.stringify({
    provider: "supermemory", scope: "global",
    supermemory: { baseUrl, apiKey: "LOCAL_SMOKE_ONLY", globalContainerTag: "smoke-global", projectContainerTag: "smoke-project" },
  }));

  // Loaded after the real package. The probe reads and executes the server's
  // registered tools through the native Promise context.
  const probe = join(consumer, "probe");
  mkdirSync(probe);
  writeFileSync(join(probe, "server.js"), `
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
export default {
  id: "memory-adapter-smoke-probe",
  async setup(ctx) {
    const tools = await ctx.tool.list();
    const registered = tools.filter(tool => /^memory[-_]/.test(tool.name));
    assert.equal(registered.length, 10);
    const results = [];
    const context = { sessionID: "smoke-session", agent: "build", messageID: "smoke-message", id: "smoke-call", signal: new AbortController().signal, progress: async () => {} };
    async function execute(name, input) {
      const tool = registered.find(tool => tool.name === name);
      assert.ok(tool, name + " is missing");
      assert.equal(tool.input.type, "object");
      assert.equal(tool.options.codemode, false);
      const result = await tool.execute(input, context);
      assert.equal(typeof result.content, "string");
      results.push({ name, content: result.content });
      return result.content;
    }
    for (const separator of ["-", "_"]) {
      const prefix = "memory" + separator;
      const content = "Native V2 smoke memory " + separator;
      const stored = await execute(prefix + "store", { content, category: "conversation" });
      const id = /Memory stored \\(([^)]+)\\)/.exec(stored)?.[1];
      assert.ok(id);
      assert.match(await execute(prefix + "recall", { query: "Native V2" }), /Native V2 smoke memory/);
      assert.match(await execute(prefix + "list", {}), /Native V2 smoke memory/);
      assert.match(await execute(prefix + "summary", {}), /Native V2 smoke memory/);
      assert.match(await execute(prefix + "delete", { id }), /Memory deleted/);
      assert.match(await execute(prefix + "list", {}), /No memories found/);
    }
    await writeFile(${JSON.stringify(reportFile)}, JSON.stringify({ version: ctx.app.version, tools: registered.map(tool => tool.name), results }));
  },
};
`);
  writeFileSync(join(worktree, "opencode.json"), JSON.stringify({ plugins: [join(consumer, "node_modules", "opencode-memory-adapter"), probe] }));
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    OPENCODE_CONFIG_DIR: join(root, "config"),
    OPENCODE_TEST_HOME: join(root, "test-home"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(root, "state"),
    SUPERMEMORY_API_URL: baseUrl,
    OPENCODE_PASSWORD: "LOCAL_SMOKE_ONLY",
  };
  const serverUrl = await new Promise((resolve, reject) => {
    nativeServer = spawn(binary, ["serve", "--hostname", "127.0.0.1", "--port", "0", "--print-logs"], { cwd: worktree, env, stdio: ["ignore", "pipe", "pipe"] });
    const timeout = setTimeout(() => reject(new Error(`OpenCode startup timed out:\n${nativeLogs}`)), 30_000);
    nativeServer.on("error", error => { clearTimeout(timeout); reject(error); });
    nativeServer.on("close", code => { clearTimeout(timeout); reject(new Error(`OpenCode server exited with ${code}:\n${nativeLogs}`)); });
    nativeServer.stderr.on("data", chunk => { nativeLogs += chunk; });
    nativeServer.stdout.on("data", chunk => {
      nativeLogs += chunk;
      const url = /server listening on (http:\/\/[^\s]+)/.exec(nativeLogs)?.[1];
      if (url) { clearTimeout(timeout); resolve(url); }
    });
  });
  let inventory;
  const deadline = Date.now() + 30_000;
  do {
    const response = await run(["api", "plugin.list", "--server", serverUrl], worktree, env);
    inventory = JSON.parse(response.stdout);
    if (inventory.data?.some(plugin => plugin.id === "memory-adapter-smoke-probe")) break;
    await delay(100);
  } while (Date.now() < deadline);
  for (const id of ["opencode-memory-adapter", "memory-adapter-smoke-probe"]) {
    const plugin = inventory.data?.find(plugin => plugin.id === id);
    assert.equal(plugin?.state.status, "active", JSON.stringify({ id, plugin }) + "\n" + nativeLogs);
  }
  const report = JSON.parse(readFileSync(reportFile, "utf8"));
  assert.equal(report.tools.length, 10);
  assert.equal(report.results.length, 12);
  assert.equal(memories.size, 0);
  console.log(JSON.stringify({ version, tools: report.tools.length, executions: report.results.length, backendRequests: requests.length }, null, 2));
  console.log("[smoke] Native V2 plugin loading and all memory tools passed");
} finally {
  if (nativeServer && nativeServer.exitCode === null) {
    await new Promise(resolve => {
      const timeout = setTimeout(() => nativeServer.kill("SIGKILL"), 5000);
      nativeServer.once("close", () => { clearTimeout(timeout); resolve(); });
      nativeServer.kill("SIGTERM");
    });
  }
  await new Promise(resolve => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}
