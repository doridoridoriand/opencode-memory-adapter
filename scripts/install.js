const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_DIR = path.join(os.homedir(), ".config", "opencode-memory");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG = {
  provider: "mem0",
  scope: "global",
  mem0: {
    ollamaBaseUrl: "http://localhost:11434",
    llmModel: "qwen2.5:7b",
    embedModel: "nomic-embed-text",
    historyDbPath: null,
  },
  honcho: {
    apiKey: "${HONCHO_API_KEY}",
    baseUrl: "http://localhost:8000",
    workspaceId: "opencode",
  },
  openviking: {
    url: "http://localhost:1933",
    apiKey: "",
  },
};

function main() {
  if (fs.existsSync(CONFIG_FILE)) {
    console.log("[opencode-memory] Config already exists at", CONFIG_FILE);
    return;
  }

  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log("[opencode-memory] Created config at", CONFIG_FILE);
  } catch (err) {
    console.warn("[opencode-memory] Failed to create config:", err.message);
  }
}

main();
