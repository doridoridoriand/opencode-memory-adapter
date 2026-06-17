#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));

const MODES = {
  staged: args.has("--staged"),
  tracked: args.has("--tracked"),
  authors: args.has("--authors"),
  publicAudit: args.has("--public-audit"),
};

if (!MODES.staged && !MODES.tracked && !MODES.authors && !MODES.publicAudit) {
  console.error(
    "Usage: node scripts/sensitive-scan.js [--staged | --tracked | --authors | --public-audit]"
  );
  process.exit(1);
}

const ALLOWED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "noreply.github.com",
  "users.noreply.github.com",
]);

const LINE_PATTERNS = [
  {
    id: "private-key",
    label: "private key header",
    regex: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,
    isAllowed: () => false,
  },
  {
    id: "github-token",
    label: "GitHub token",
    regex: /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    isAllowed: () => false,
  },
  {
    id: "openai-key",
    label: "OpenAI-style key",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    isAllowed: () => false,
  },
  {
    id: "aws-access-key",
    label: "AWS access key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    isAllowed: () => false,
  },
  {
    id: "slack-token",
    label: "Slack token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    isAllowed: () => false,
  },
  {
    id: "absolute-home-path",
    label: "absolute home path",
    regex: /(?:\/Users\/[A-Za-z0-9._-]+(?:\/[^\s"'`]*)?|\/home\/[A-Za-z0-9._-]+(?:\/[^\s"'`]*)?)/g,
    isAllowed: () => false,
  },
  {
    id: "email-address",
    label: "email address",
    regex: /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    isAllowed: (match) => {
      const domain = match.split("@")[1]?.toLowerCase();
      return domain != null && ALLOWED_EMAIL_DOMAINS.has(domain);
    },
  },
  {
    id: "literal-secret-assignment",
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

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function redact(line) {
  let result = line;

  result = result.replace(
    /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    "[REDACTED]"
  );
  result = result.replace(
    /\b(api[_-]?key|secret|token|password)\b(\s*[:=]\s*)(["'`])([^"'`]*)\3/gi,
    (_match, key, separator, quote) => `${key}${separator}${quote}***${quote}`
  );
  result = result.replace(
    /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    "[EMAIL REDACTED]"
  );

  return result.length > 200 ? `${result.slice(0, 197)}...` : result;
}

function collectLineFindings(file, lineNumber, line, findings) {
  if (line.includes("sensitive-scan: allow")) return;

  for (const pattern of LINE_PATTERNS) {
    for (const match of line.matchAll(pattern.regex)) {
      const value = match[0];
      if (pattern.isAllowed(value)) continue;
      findings.push({
        source: file,
        line: lineNumber,
        type: pattern.label,
        snippet: redact(line),
      });
    }
  }
}

function scanTrackedFiles() {
  const findings = [];
  const files = runGit(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean);

  for (const file of files) {
    const buffer = readFileSync(file);
    if (buffer.includes(0)) continue;
    const lines = buffer.toString("utf8").split(/\r?\n/);
    lines.forEach((line, index) => collectLineFindings(file, index + 1, line, findings));
  }

  return findings;
}

function scanStagedDiff() {
  const findings = [];
  const diff = runGit(["diff", "--cached", "--no-color", "--unified=0", "--diff-filter=ACMR"]);
  const lines = diff.split(/\r?\n/);

  let currentFile = null;
  let nextLineNumber = 0;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      continue;
    }

    if (line.startsWith("@@")) {
      const match = line.match(/\+(\d+)(?:,\d+)?/);
      nextLineNumber = match ? Number(match[1]) : 0;
      continue;
    }

    if (!currentFile || line.startsWith("diff --git") || line.startsWith("--- ")) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      collectLineFindings(currentFile, nextLineNumber, line.slice(1), findings);
      nextLineNumber += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      nextLineNumber += 1;
    }
  }

  return findings;
}

function scanAuthors() {
  const findings = [];
  const output = runGit(["log", "--format=%h%x09%an%x09%ae", "--reverse"]);
  const seen = new Set();

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [commit, author, email] = line.split("\t");
    if (!commit || !email) continue;
    const key = `${author}\t${email}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && ALLOWED_EMAIL_DOMAINS.has(domain)) continue;

    findings.push({
      source: "git-history",
      line: commit,
      type: "public author email in commit metadata",
      snippet: `${author} <${email}>`,
    });
  }

  const currentEmail = runGit(["config", "--get", "user.email"]).trim();
  if (currentEmail) {
    const domain = currentEmail.split("@")[1]?.toLowerCase();
    if (!domain || !ALLOWED_EMAIL_DOMAINS.has(domain)) {
      findings.push({
        source: "git-config",
        line: "user.email",
        type: "current git user.email may expose personal email in future commits",
        snippet: currentEmail,
      });
    }
  }

  return findings;
}

function printFindings(findings, title) {
  if (findings.length === 0) {
    console.log(`[ok] ${title}: no findings`);
    return;
  }

  console.error(`[fail] ${title}: ${findings.length} finding(s)`);
  for (const finding of findings) {
    console.error(
      `  - ${finding.source}:${finding.line} ${finding.type}\n    ${finding.snippet}`
    );
  }
}

let failed = false;

if (MODES.staged) {
  const findings = scanStagedDiff();
  printFindings(findings, "staged diff scan");
  failed ||= findings.length > 0;
}

if (MODES.tracked || MODES.publicAudit) {
  const findings = scanTrackedFiles();
  printFindings(findings, "tracked file scan");
  failed ||= findings.length > 0;
}

if (MODES.authors || MODES.publicAudit) {
  const findings = scanAuthors();
  printFindings(findings, "git metadata scan");
  failed ||= findings.length > 0;
}

process.exit(failed ? 1 : 0);
