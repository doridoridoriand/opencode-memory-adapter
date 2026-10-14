import { spawn } from "node:child_process";

export function runSmokeCommand(command, args, { cwd, env, timeoutMs = 60_000, killGraceMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let escalation;
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    const timeout = setTimeout(() => {
      timedOut = true;
      escalation = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
      child.kill("SIGTERM");
    }, timeoutMs);
    function clearTimers() {
      clearTimeout(timeout);
      clearTimeout(escalation);
    }
    child.once("error", error => {
      clearTimers();
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimers();
      if (timedOut) {
        reject(new Error(`${command} timed out after ${timeoutMs}ms (signal ${signal ?? "none"}):\n${stderr}\n${stdout}`));
      } else if (code !== 0) {
        reject(new Error(`${command} exited with ${code}:\n${stderr}\n${stdout}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
