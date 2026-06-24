# Provider Setup Guides

Use this directory when you want provider-specific setup instructions instead of the shorter root `README.md`.

## Which provider should I pick?

| Provider | Best fit | What you need | Guide |
| --- | --- | --- | --- |
| `mem0` | Local-first development, minimal infrastructure, private on-disk storage | Ollama, writable local storage | [mem0.md](./mem0.md) |
| `honcho` | Managed memory or an existing Honcho deployment | Reachable Honcho deployment, API key when the deployment requires one | [honcho.md](./honcho.md) |
| `openviking` | Self-hosted server and filesystem-style memory resources | Running OpenViking server, API key only when enabled on that server | [openviking.md](./openviking.md) |

## Common workflow

1. Install `opencode-memory-adapter`.
2. Run `npx opencode-memory-adapter init`.
3. Update `~/.config/opencode-memory-adapter/config.json` or create a project-local `.opencode-memory-adapter.json`.
4. Set `"provider"` to `mem0`, `honcho`, or `openviking`.
5. Restart OpenCode.
6. Store one memory and immediately recall it to verify the setup.

## Global config vs project config

- Use the global config at `~/.config/opencode-memory-adapter/config.json` if you want the same provider and credentials across many repositories.
- Use `.opencode-memory-adapter.json` in a single repository if that project should have its own provider, workspace, URL, or storage paths.
- A project-local config is the safest way to test `mem0` while keeping an existing global `honcho` or `openviking` setup unchanged.
- Project config overrides global config.

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

If step 2 succeeds but step 3 fails, jump to the troubleshooting section in the provider-specific guide.
