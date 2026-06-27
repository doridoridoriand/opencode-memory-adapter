# Provider Setup Guides

Use this directory when you want provider-specific setup instructions instead of the shorter root `README.md`.

## Common prerequisites

- Node.js 22 or newer
- OpenCode configured to load the `opencode-memory-adapter` plugin
- For `mem0`: an OpenAI-compatible endpoint and writable local storage. Ollama is the generated default and the simplest local option.
- For `honcho` / `openviking`: a reachable server URL and any required API key

## Which provider should I pick?

| Provider | Best fit | What you need | Guide |
| --- | --- | --- | --- |
| `mem0` | Local-first development, minimal infrastructure, private on-disk storage | OpenAI-compatible endpoint (Ollama by default), writable local storage | [mem0.md](./mem0.md) |
| `honcho` | Managed memory or an existing Honcho deployment | Reachable Honcho deployment, API key when the deployment requires one | [honcho.md](./honcho.md) |
| `openviking` | Self-hosted server and filesystem-style memory resources | Running OpenViking server, API key only when enabled on that server | [openviking.md](./openviking.md) |

## Common workflow

1. Install `opencode-memory-adapter`.
2. Run `npx opencode-memory-adapter init`.
3. Update `~/.config/opencode-memory-adapter/config.json`, or manually create a project-local `.opencode-memory-adapter.json`.
4. Set `"provider"` to `mem0`, `honcho`, or `openviking`.
5. Restart OpenCode.
6. Store one memory and immediately recall it to verify the setup.

`npx opencode-memory-adapter init` creates only the global config file. If you want a project-local
`.opencode-memory-adapter.json`, create it yourself.

## Global config vs project config

- Use the global config at `~/.config/opencode-memory-adapter/config.json` if you want the same provider and credentials across many repositories.
- Use `.opencode-memory-adapter.json` in a single repository if that project should have its own provider, workspace, URL, or storage paths.
- A project-local config is the safest way to test `mem0` while keeping an existing global `honcho` or `openviking` setup unchanged.
- Project config overrides global config.
- A project-local file can contain only the keys you want to override.

## What `scope` means

- `scope` is a plugin-level label used when storing and filtering memories.
- `scope: "project"` does not automatically detect the current repository.
- `scope: "project"` does not create a unique namespace for each repository on its own.

If you need per-repository separation:

- `mem0`: use repo-specific `historyDbPath` and `vectorStorePath`, or a distinct Qdrant `collectionName`.
- `honcho`: use a distinct `workspaceId` per repository.
- `openviking`: the current provider shares one `opencode-memory-adapter/` resource root; `scope` only chooses the `global/` or `project/` subtree.

## Recommended first choice

Start with `mem0` unless you already know you want a hosted memory service or a self-hosted server. It has the fewest moving parts once Ollama is running.

## Tool-only behavior

This plugin adds tools only. OpenCode will not automatically persist memories just because the
plugin is installed. If you want proactive memory usage, pair the plugin with repository or team
instructions such as `AGENTS.md`.

## Verification checklist

Regardless of provider, the fastest validation is:

1. Restart OpenCode.
2. Save a test fact with `memory-store`.
3. Query it with `memory-recall`.
4. Confirm it appears in `memory-list`.
5. Remove it with `memory-delete`.
6. Use the same `scope` for store, recall, and list during the first verification pass.

If step 2 succeeds but step 3 fails, jump to the troubleshooting section in the provider-specific guide.
