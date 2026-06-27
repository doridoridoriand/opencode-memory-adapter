# Changelog

This changelog was reconstructed from the repository's Git tags and commit history.

## [v0.2.0] - 2026-06-27

### Added

- Added a new `supermemory` provider with defaults for local/self-hosted deployments, OpenCode config wiring, and full provider guide documentation.
- Added provider coverage for Supermemory store, recall, list, delete, config merge behavior, and runtime base URL overrides.

### Changed

- Clarified installation, publishing, and provider setup guidance across the README and provider docs, including project-local override behavior and optional runtime dependency notes.
- Hardened the Supermemory integration around category-aware search, filtered pagination for `memory-list`, idempotent delete handling, and bounded request timeouts for stalled HTTP calls.

## [v0.1.3] - 2026-06-24

### Fixed

- Made OpenViking `memory-store` and `memory-delete` resilient when `/api/v1/system/wait` fails after the resource write or delete completes, logging a warning instead of surfacing a hard failure.
- Expanded OpenViking test coverage for wait-failure scenarios after add and delete operations.

### Changed

- Extended the mock provider service and OpenViking tests to cover follow-up review feedback around asynchronous indexing behavior.

## [v0.1.2] - 2026-06-23

### Changed

- Reworked OpenViking writes to create directories via `/api/v1/fs/mkdir`, upload markdown bodies through WebDAV `PUT`, and wait for indexing before returning from `memory-store`.
- Ignored OpenViking-generated helper files such as `.abstract.md` and `.overview.md` during memory listing and recall.
- Updated the README and OpenViking provider guide to document the WebDAV plus indexing flow and helper-file filtering.
- Reworked OpenViking provider tests around WebDAV uploads, directory creation, search filtering, and delete reindex waits.

## [v0.1.1] - 2026-06-23

### Added

- Initial public release of `opencode-memory-adapter`.
- Memory tools for storing, recalling, deleting, listing, and summarizing persistent memories.
- Provider backends for `mem0`, `Honcho`, and `OpenViking`.
- Config bootstrap CLI, provider setup guides, smoke tests, and unit and end-to-end coverage.

### Changed

- Fixed persistence and runtime-isolation issues in the plugin implementation and followed up on mem0 review issues.
- Renamed the package to `opencode-memory-adapter` and dropped Node 20 support in favor of Node 22 and newer.
- Hardened package publication and public-repository safety checks, including dependency overrides, publication audits, and CI workflow updates.
- Added provider smoke-test readiness improvements, mem0 vector store dimension fixes, and self-hosted Honcho integration fixes.
- Documented local-only npm publishing and aligned CI with npm 11.

[v0.1.1]: https://github.com/doridoridoriand/opencode-memory-adapter/compare/68797b3...v0.1.1
[v0.1.2]: https://github.com/doridoridoriand/opencode-memory-adapter/compare/v0.1.1...v0.1.2
[v0.1.3]: https://github.com/doridoridoriand/opencode-memory-adapter/compare/v0.1.2...v0.1.3
[v0.2.0]: https://github.com/doridoridoriand/opencode-memory-adapter/compare/v0.1.3...v0.2.0
