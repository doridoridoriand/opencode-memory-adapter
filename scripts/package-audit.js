#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ALLOWED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "noreply.github.com",
  "users.noreply.github.com",
]);

const ALLOWED_PACKAGE_PATHS = [
  /^LICENSE$/,
  /^README\.md$/,
  /^package\.json$/,
  /^dist\//,
  /^docs\//,
  /^scripts\/init-config\.js$/,
];

const LINE_PATTERNS = [
  {
    label: "private key header",
    regex: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,
    isAllowed: () => false,
  },
  {
    label: "GitHub token",
    regex: /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    isAllowed: () => false,
  },
  {
    label: "OpenAI-style key",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    isAllowed: () => false,
  },
  {
    label: "AWS access key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    isAllowed: () => false,
  },
  {
    label: "Slack token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    isAllowed: () => false,
  },
  {
    label: "absolute home path",
    regex: /(?:\/Users\/[A-Za-z0-9._-]+(?:\/[^\s"'`]*)?|\/home\/[A-Za-z0-9._-]+(?:\/[^\s"'`]*)?)/g,
    isAllowed: () => false,
  },
  {
    label: "email address",
    regex: /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    isAllowed: (match) => {
      const domain = match.split("@")[1]?.toLowerCase();
      return domain != null && ALLOWED_EMAIL_DOMAINS.has(domain);
    },
  },
  {
    label: "literal secret assignment",
    regex:
      /\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*(["'`])([^"'`]{8,})\2/gi,
    isAllowed: (match) => {
      const valueMatch = match.match(/(["'`])([^"'`]{0,})\1$/);
      const value = valueMatch?.[2] ?? "";
      return (
        value.length === 0 ||
        value.includes("${") ||
        value.includes("process.env") ||
        /^[A-Z0-9_]+$/.test(value) ||
        /^https?:\/\//i.test(value)
      );
    },
  },
];

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function listFiles(root) {
  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

function collectFindings(filePath, findings) {
  const buffer = readFileSync(filePath);
  if (buffer.includes(0)) return;

  const relativePath = filePath.replace(/.*\/package\//, "");
  const lines = buffer.toString("utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes("sensitive-scan: allow")) return;

    for (const pattern of LINE_PATTERNS) {
      for (const match of line.matchAll(pattern.regex)) {
        const value = match[0];
        if (pattern.isAllowed(value)) continue;
        findings.push({
          file: relativePath,
          line: index + 1,
          type: pattern.label,
          snippet: line.length > 200 ? `${line.slice(0, 197)}...` : line,
        });
      }
    }
  });
}

function collectUnexpectedFiles(files, findings) {
  for (const file of files) {
    const relativePath = file.replace(/.*\/package\//, "");
    const isAllowed = ALLOWED_PACKAGE_PATHS.some((pattern) => pattern.test(relativePath));
    if (!isAllowed) {
      findings.push({
        file: relativePath,
        line: 0,
        type: "unexpected published file",
        snippet: relativePath,
      });
    }
  }
}

function main() {
  const tempRoot = mkdtempSync(join(tmpdir(), "opencode-memory-adapter-pack-audit-"));

  try {
    const packOutput = run("npm", ["pack", "--pack-destination", tempRoot, "--json"]);
    const tarballName = JSON.parse(packOutput)?.[0]?.filename;
    if (!tarballName) {
      throw new Error("npm pack did not return a tarball filename.");
    }

    run("tar", ["-xzf", join(tempRoot, tarballName), "-C", tempRoot]);
    const packageRoot = join(tempRoot, "package");
    const files = listFiles(packageRoot);
    const findings = [];

    collectUnexpectedFiles(files, findings);

    for (const file of files) {
      collectFindings(file, findings);
    }

    if (findings.length === 0) {
      console.log(`[ok] package tarball scan: ${files.length} files checked`);
      return;
    }

    console.error(`[fail] package tarball scan: ${findings.length} finding(s)`);
    for (const finding of findings) {
      console.error(
        `  - ${finding.file}:${finding.line} ${finding.type}\n    ${finding.snippet}`
      );
    }
    process.exitCode = 1;
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
