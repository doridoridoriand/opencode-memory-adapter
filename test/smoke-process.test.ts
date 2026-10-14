import { describe, expect, it } from "vitest";
import { runSmokeCommand } from "../scripts/smoke-process.js";

describe("smoke command processes", () => {
  it("captures successful command output", async () => {
    await expect(runSmokeCommand(process.execPath, ["-e", 'console.log("stdout"); console.error("stderr");']))
      .resolves.toEqual({ stdout: "stdout\n", stderr: "stderr\n" });
  });

  it("rejects a spawn error", async () => {
    await expect(runSmokeCommand("opencode-memory-nonexistent-test-command", []))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it.skipIf(process.platform === "win32")("kills a command that ignores SIGTERM instead of hanging", async () => {
    const script = `
      process.on("SIGTERM", () => console.error("SIGTERM ignored"));
      console.log("ready");
      setTimeout(() => process.exit(99), 4000);
    `;
    await expect(runSmokeCommand(process.execPath, ["-e", script], { timeoutMs: 1200, killGraceMs: 100 }))
      .rejects.toThrow(/timed out after 1200ms \(signal SIGKILL\):\nSIGTERM ignored\n\nready/);
  }, 5000);
});
