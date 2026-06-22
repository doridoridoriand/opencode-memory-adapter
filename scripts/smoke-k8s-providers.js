#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KUBECTL_CONTEXT = process.env.KUBECTL_CONTEXT || "docker-desktop";
const NAMESPACE = "opencode-memory-adapter-smoke";
const POD_NAME = "opencode-memory-adapter-smoke";
const POD_POLL_INTERVAL_MS = 2_000;
const POD_PROGRESS_TIMEOUT_MS = Number(process.env.POD_PROGRESS_TIMEOUT_MS || 300_000);
const POD_TOTAL_TIMEOUT_MS = Number(process.env.POD_TOTAL_TIMEOUT_MS || 900_000);

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

function applyManifest(yaml, args) {
  execFileSync(
    "kubectl",
    [...args, "apply", "-f", "-"],
    {
      input: yaml,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    }
  );
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runKubectlJson(args, options = {}) {
  const output = run("kubectl", args, options);
  return output.length > 0 ? JSON.parse(output) : null;
}

function tryRunKubectlJson(args, options = {}) {
  try {
    return runKubectlJson(args, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/NotFound/i.test(message)) {
      return null;
    }
    throw error;
  }
}

function ensureDocker() {
  try {
    run("docker", ["info"]);
  } catch {
    throw new Error("Docker daemon is not running.");
  }
}

function shouldRequireDockerDaemon() {
  return KUBECTL_CONTEXT === "docker-desktop";
}

function ensureKubernetesContext() {
  const contexts = run("kubectl", ["config", "get-contexts", "-o", "name"])
    .split(/\r?\n/)
    .filter(Boolean);

  if (!contexts.includes(KUBECTL_CONTEXT)) {
    throw new Error(
      `Kubernetes context "${KUBECTL_CONTEXT}" was not found. ` +
        `Set KUBECTL_CONTEXT to a valid context and ensure the matching kubeconfig is loaded.`
    );
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      run("kubectl", [
        "--context",
        KUBECTL_CONTEXT,
        "--request-timeout=5s",
        "get",
        "--raw=/readyz",
      ]);
      return;
    } catch {
      sleep(2_000);
    }
  }

  throw new Error(
    `Kubernetes context "${KUBECTL_CONTEXT}" is not reachable. ` +
      (shouldRequireDockerDaemon()
        ? "Ensure Docker Desktop Kubernetes is running before executing the smoke test."
        : "Ensure the target cluster is reachable before executing the smoke test.")
  );
}

function ensureNamespace() {
  const manifest = run("kubectl", [
    "--context",
    KUBECTL_CONTEXT,
    "create",
    "namespace",
    NAMESPACE,
    "--dry-run=client",
    "-o",
    "yaml",
  ]);
  applyManifest(manifest, ["--context", KUBECTL_CONTEXT]);
}

function applyMockConfigMap(repoRoot) {
  const manifest = run("kubectl", [
    "--context",
    KUBECTL_CONTEXT,
    "-n",
    NAMESPACE,
    "create",
    "configmap",
    "opencode-memory-adapter-mock",
    `--from-file=server.js=${join(repoRoot, "scripts", "mock-provider-service.js")}`,
    "--dry-run=client",
    "-o",
    "yaml",
  ]);
  applyManifest(manifest, ["--context", KUBECTL_CONTEXT, "-n", NAMESPACE]);
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

  applyManifest(manifest, ["--context", KUBECTL_CONTEXT, "-n", NAMESPACE]);
}

function waitForPod() {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastStateKey = "";
  let lastEventKey = "";

  while (Date.now() - startedAt <= POD_TOTAL_TIMEOUT_MS) {
    const pod = tryRunKubectlJson(
      [
        "--context",
        KUBECTL_CONTEXT,
        "-n",
        NAMESPACE,
        "get",
        "pod",
        POD_NAME,
        "-o",
        "json",
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    );

    const stateKey = JSON.stringify({
      phase: pod?.status?.phase ?? "Unknown",
      ready: pod?.status?.conditions?.find((condition) => condition.type === "Ready")?.status ?? "Unknown",
      waiting: (pod?.status?.containerStatuses ?? []).map((status) => ({
        name: status.name,
        waiting: status.state?.waiting?.reason ?? null,
        running: Boolean(status.state?.running),
        terminated: status.state?.terminated?.reason ?? null,
      })),
    });
    if (stateKey !== lastStateKey) {
      const readyContainers = (pod?.status?.containerStatuses ?? []).filter(
        (status) => status.ready
      ).length;
      const totalContainers = pod?.spec?.containers?.length ?? 0;
      const phase = pod?.status?.phase ?? "Unknown";
      console.log(
        `[k8s-smoke] pod state: ${phase} (${readyContainers}/${totalContainers} containers ready)`
      );
      lastStateKey = stateKey;
      lastProgressAt = Date.now();
    }

    const readyCondition = pod?.status?.conditions?.find((condition) => condition.type === "Ready");
    if (readyCondition?.status === "True") {
      console.log("[k8s-smoke] pod condition met");
      return;
    }

    const fatalReason = (pod?.status?.containerStatuses ?? [])
      .map((status) => status.state?.waiting?.reason ?? status.state?.terminated?.reason ?? null)
      .find((reason) =>
        [
          "CreateContainerConfigError",
          "CreateContainerError",
          "CrashLoopBackOff",
          "ErrImagePull",
          "ImageInspectError",
          "InvalidImageName",
          "RunContainerError",
        ].includes(reason ?? "")
      );
    if (fatalReason) {
      throw new Error(`Pod entered a fatal state before becoming ready: ${fatalReason}`);
    }

    const events = runKubectlJson(
      [
        "--context",
        KUBECTL_CONTEXT,
        "-n",
        NAMESPACE,
        "get",
        "events",
        "--field-selector",
        `involvedObject.kind=Pod,involvedObject.name=${POD_NAME}`,
        "-o",
        "json",
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    const latestEvent = (events?.items ?? [])
      .slice()
      .sort((left, right) =>
        String(
          right.lastTimestamp ??
            right.eventTime ??
            right.metadata?.creationTimestamp ??
            ""
        ).localeCompare(
          String(
            left.lastTimestamp ??
              left.eventTime ??
              left.metadata?.creationTimestamp ??
              ""
          )
        )
      )[0];

    if (latestEvent) {
      const eventKey = JSON.stringify({
        reason: latestEvent.reason,
        message: latestEvent.message,
        timestamp:
          latestEvent.lastTimestamp ??
          latestEvent.eventTime ??
          latestEvent.metadata?.creationTimestamp ??
          "",
      });
      if (eventKey !== lastEventKey) {
        console.log(
          `[k8s-smoke] pod event: ${latestEvent.reason ?? "Unknown"} - ${latestEvent.message ?? ""}`
        );
        lastEventKey = eventKey;
        lastProgressAt = Date.now();
      }
    }

    if (Date.now() - lastProgressAt > POD_PROGRESS_TIMEOUT_MS) {
      throw new Error(
        `Pod did not make progress for ${Math.round(POD_PROGRESS_TIMEOUT_MS / 1000)}s while waiting for readiness.`
      );
    }

    sleep(POD_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Pod did not become ready within ${Math.round(POD_TOTAL_TIMEOUT_MS / 1000)}s.`
  );
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
    if (shouldRequireDockerDaemon()) {
      ensureDocker();
    }
    ensureKubernetesContext();
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
