#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function runGit(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) return "";
    throw error;
  }
}

function main() {
  const repoRoot = runGit(["rev-parse", "--show-toplevel"]);
  const current = runGit(["config", "--get", "core.hooksPath"], { allowFailure: true });

  if (current === ".githooks") {
    console.log(`[hooks] core.hooksPath is already set to .githooks in ${repoRoot}`);
    return;
  }

  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "inherit",
  });
  console.log(`[hooks] Set core.hooksPath to .githooks in ${repoRoot}`);
}

main();
