#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLUSTER_NAME = "opencode-memory-adapter-smoke";
const KUBECTL_CONTEXT = `kind-${CLUSTER_NAME}`;
const NAMESPACE = "opencode-memory-adapter-smoke";
const POD_NAME = "opencode-memory-adapter-smoke";

function run(cmd, args, options = {}) {
  const result = execFileSync(cmd, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  return typeof result === "string" ? result.trim() : "";
}

function runInherit(cmd, args, options = {}) {
  execFileSync(cmd, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
}

function ensureDocker() {
  try {
    run("docker", ["info"]);
  } catch {
    throw new Error("Docker daemon is not running.");
  }
}

function ensureKindCluster() {
  const clusters = run("kind", ["get", "clusters"]).split(/\r?\n/).filter(Boolean);
  if (!clusters.includes(CLUSTER_NAME)) {
    runInherit("kind", ["create", "cluster", "--name", CLUSTER_NAME, "--wait", "120s"]);
  }
}

function ensureNamespace() {
  run(
    "sh",
    [
      "-lc",
      `kubectl --context ${KUBECTL_CONTEXT} create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl --context ${KUBECTL_CONTEXT} apply -f -`,
    ],
    { stdio: "inherit" }
  );
}

function applyMockConfigMap(repoRoot) {
  run(
    "sh",
    [
      "-lc",
      `kubectl --context ${KUBECTL_CONTEXT} -n ${NAMESPACE} create configmap opencode-memory-adapter-mock --from-file=server.js=${join(
        repoRoot,
        "scripts",
        "mock-provider-service.js"
      )} --dry-run=client -o yaml | kubectl --context ${KUBECTL_CONTEXT} -n ${NAMESPACE} apply -f -`,
    ],
    { stdio: "inherit" }
  );
}

function recreatePod() {
  runInherit("kubectl", [
    "--context",
    KUBECTL_CONTEXT,
    "-n",
    NAMESPACE,
    "delete",
    "pod",
    POD_NAME,
    "--ignore-not-found",
    "--wait=true",
  ]);

  const manifest = `apiVersion: v1
kind: Pod
metadata:
  name: ${POD_NAME}
spec:
  restartPolicy: Never
  containers:
    - name: tester
      image: node:22-bookworm
      command: ["sh", "-lc", "sleep infinity"]
      volumeMounts:
        - name: tmp
          mountPath: /tmp
    - name: mock
      image: node:22-bookworm
      command: ["node", "/mock/server.js"]
      ports:
        - containerPort: 8080
      volumeMounts:
        - name: mock
          mountPath: /mock
        - name: tmp
          mountPath: /tmp
  volumes:
    - name: mock
      configMap:
        name: opencode-memory-adapter-mock
    - name: tmp
      emptyDir: {}
`;

  execFileSync(
    "kubectl",
    ["--context", KUBECTL_CONTEXT, "-n", NAMESPACE, "apply", "-f", "-"],
    {
      input: manifest,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    }
  );
}

function waitForPod() {
  runInherit("kubectl", [
    "--context",
    KUBECTL_CONTEXT,
    "-n",
    NAMESPACE,
    "wait",
    "--for=condition=Ready",
    `pod/${POD_NAME}`,
    "--timeout=180s",
  ]);
}

function copyIntoPod(localPath, remotePath) {
  runInherit("kubectl", [
    "--context",
    KUBECTL_CONTEXT,
    "-n",
    NAMESPACE,
    "cp",
    localPath,
    `${POD_NAME}:${remotePath}`,
    "-c",
    "tester",
  ]);
}

function execInPod(args) {
  runInherit("kubectl", [
    "--context",
    KUBECTL_CONTEXT,
    "-n",
    NAMESPACE,
    "exec",
    POD_NAME,
    "-c",
    "tester",
    "--",
    ...args,
  ]);
}

function packPlugin(repoRoot, packDir) {
  return run("npm", ["pack", "--pack-destination", packDir], { cwd: repoRoot }).split(/\r?\n/).at(-1);
}

function main() {
  const repoRoot = process.cwd();
  const tempRoot = mkdtempSync(join(tmpdir(), "opencode-memory-adapter-k8s-host-"));

  try {
    ensureDocker();
    ensureKindCluster();
    ensureNamespace();
    applyMockConfigMap(repoRoot);
    recreatePod();
    waitForPod();

    const tarballName = packPlugin(repoRoot, tempRoot);
    if (!tarballName) {
      throw new Error("npm pack did not produce a tarball.");
    }

    execInPod(["mkdir", "-p", "/workspace"]);
    copyIntoPod(join(tempRoot, tarballName), "/workspace/plugin.tgz");
    copyIntoPod(
      join(repoRoot, "scripts", "smoke-k8s-providers-runner.js"),
      "/workspace/smoke-k8s-providers-runner.js"
    );

    execInPod(["node", "/workspace/smoke-k8s-providers-runner.js", "/workspace/plugin.tgz"]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
