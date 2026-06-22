# Provider Setup Guides

Use this directory when you want provider-specific setup instructions instead of the shorter root `README.md`.

## Which provider should I pick?

| Provider | Best fit | What you need | Guide |
| --- | --- | --- | --- |
| `mem0` | Local-first development, minimal infrastructure, private on-disk storage | Ollama, `mem0ai`, `better-sqlite3` | [mem0.md](./mem0.md) |
| `honcho` | Managed memory or an existing Honcho deployment | Honcho API key, `@honcho-ai/sdk` | [honcho.md](./honcho.md) |
| `openviking` | Self-hosted server and filesystem-style memory resources | Running OpenViking server, `@yfedberts/huscarl` | [openviking.md](./openviking.md) |

## Common workflow

1. Install `opencode-memory-plugin` and the peer dependencies for exactly one provider.
2. Run `npx opencode-memory-plugin init`.
3. Update `~/.config/opencode-memory/config.json` or create a project-local `.opencode-memory.json`.
4. Set `"provider"` to `mem0`, `honcho`, or `openviking`.
5. Restart OpenCode.
6. Store one memory and immediately recall it to verify the setup.

## Global config vs project config

- Use the global config at `~/.config/opencode-memory/config.json` if you want the same provider and credentials across many repositories.
- Use `.opencode-memory.json` in a single repository if that project should have its own provider, workspace, URL, or storage paths.
- Project config overrides global config.

## Recommended first choice

Start with `mem0` unless you already know you want a hosted memory service or a self-hosted server. It has the fewest moving parts once Ollama is running.

## Verification checklist

Regardless of provider, the fastest validation is:

1. Restart OpenCode.
2. Save a test fact with `memory-store`.
3. Query it with `memory-recall`.
4. Confirm it appears in `memory-list`.
5. Remove it with `memory-delete`.

If step 2 succeeds but step 3 fails, jump to the troubleshooting section in the provider-specific guide.
