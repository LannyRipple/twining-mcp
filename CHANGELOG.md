# Changelog

All notable changes to Twining MCP are documented here.

## [1.17.0] - 2026-04-06

### Added
- `twining_record` tool — unified recording that accepts natural language summary, decisions, findings, assumptions, constraints, and affected files in one call. Decisions are parsed into structured records automatically ("Chose X over Y — reason" extracts rationale and rejected alternatives). Scope auto-inferred from git diff when omitted.
- `twining_housekeeping` tool — periodic store maintenance: archives old entries, removes duplicates, surfaces stale provisionals and dangling warnings, prunes orphaned graph entities, rotates old metrics. Dry-run by default.
- `PreToolUse` hook on `git commit` — blocks commits until `twining_record` is called, enforcing decision capture at the natural checkpoint
- Natural language decision parser (`record-parser.ts`) — extracts summary, rationale, rejected alternatives, and domain from freeform sentences

### Changed
- Lifecycle simplified from 3 gates to 2: Gate 1 (assemble) + Gate 2 (record). Gate 2 replaces the old decide+post+verify ceremony with a single `twining_record` call.
- Stop hook rewritten — blocks session exit when code changes lack recording, asks for one action: "call twining_record"
- MCP server instructions condensed — 2 gates, 4 core tools listed instead of full tool group taxonomy

### Plugin v1.8.0
- SessionStart prompt updated: "Two gates: assemble FIRST, record LAST"
- PreToolUse hook added for git commit enforcement
- Stop hook blocks with single-action message instead of 3-step checklist
- CLAUDE.md gates: Gate 2 is now "Record (BEFORE committing or ending)"
- Housekeeping recommendation added for long sessions

## [1.16.0] - 2026-04-05

### Added
- `--version` / `-v` CLI flag — prints version and exits before starting MCP server
- Decision tiering in assemble output — top 3 CRITICAL (full detail), next 2 CONTEXT (summary), rest omitted with count
- Scope-distance weighting in assemble scoring — exact/child scope = 1.0, parent = 0.7, grandparent+ = 0.4
- YOUR NEXT STEP directive at end of assemble briefing — explicit first-action guidance
- `full_surface` config wired to tool registration — 15 rarely-used tools hidden by default, 17 remain

### Changed
- Gate 3 changed from mandatory `twining_verify` to mandatory `twining_post` status entry
- Default verify checks reduced from 5 to 3 (excludes test_coverage and constraints)
- Verify auto-post finding only fires on failures, not on pass/skip
- Stop hook changed from blocking to approve-with-systemMessage reminder
- Conflict detection tightened to same-or-narrower scope only (broad decisions no longer trigger false conflicts)
- Conflict response softened from warning to finding; new decisions stay active instead of provisional
- Assemble tool returns briefing + metadata only (no duplicate raw JSON)
- Auto-orient instruction strengthened to imperative first-call requirement
- Improved tool descriptions for ToolSearch discoverability

### Plugin v1.7.0
- CLAUDE.md gates updated: Gate 3 is now "Status & Handoff"
- BEHAVIORS.md: VERIFY-01 changed from MUST to SHOULD
- Stop hook: approve-with-reminder instead of blocking
- SessionStart prompt: imperative assemble-first instruction
- Verify skill: marked as recommended for complex tasks, not required

## [1.8.1] - 2026-02-28

### Fixed
- Dashboard auto-open now targets the correct project when multiple instances run

## [1.8.0] - 2026-02-28

### Added
- `twining_register` tool and subagent dispatch integration for Claude Code plugin
- Blackboard Stream View — alternate card-based visualization with time groups and thread lines
- Graph toolbar with type filters and hover effects
- Search bar redesign with toggle chips and search icon

### Fixed
- Timeline zoom stuck bug — replaced `overflow:auto` with `overflow:hidden` and added zoom controls
- Stop hook now tracks per-commit Twining coverage via line-number comparison

## [1.7.1] - 2026-02-28

### Added
- Plugin release automation with version bump script and CI enforcement
- Self-hosted GitHub marketplace for plugin distribution

### Fixed
- Skip ONNX embedding init in tests to eliminate 30s timeouts
- Replace prompt-type Stop hook with command-type for reliable JSON validation
- Dashboard UI redesign and 3 bug fixes

## [1.7.0] - 2026-02-27

### Added
- Claude Code plugin with skills, hooks, agents, and MCP server instructions
- CI/CD badge and documentation in README

## [1.6.5] - 2026-02-26

### Added
- CI and publish GitHub Actions workflows with Node 18/20/22 matrix
- npm publish with provenance attestations and auto-generated GitHub Releases
- Build-time PostHog API key injection (no more hardcoded secrets)

### Fixed
- Removed hardcoded PostHog API key from source code

## [1.6.0] - 2026-02-26

### Added
- `twining_promote` tool — promote provisional decisions to active
- `twining_prune_graph` tool — remove orphaned graph entities
- `twining_dismiss` tool — targeted blackboard entry removal

### Fixed
- PostHog telemetry YAML config format

## [1.5.0] - 2026-02-26

### Added
- Three-layer usage analytics: value stats, tool metrics, opt-in PostHog telemetry
- Project name in dashboard title with GitHub icon link

## [1.4.2] - 2026-02-20

### Added
- 5 remaining design spec gaps implemented
- P0-P2 verification and rigor capabilities in integration guides

### Fixed
- Critical and high-severity issues from deep code review
- Flaky handoff sort test

## [1.4.1] - 2026-02-19

### Added
- Dashboard UI polish with improved visualizations and activity tracking

## [1.4.0] - 2026-02-19

### Added
- `twining_verify` tool — drift detection and constraint checking
- Integration tests for full tool-to-engine flows
- Context assembly caching and tracking
- Federation design document
- 4 new coordination tools from architecture gap closure
- Claude Code Review and PR Assistant GitHub Actions

### Fixed
- 9 gaps from architecture review closed

## [1.3.0] - 2026-02-17

### Added
- Agent coordination: `twining_agents`, `twining_discover`, `twining_delegate`, `twining_handoff`, `twining_acknowledge`
- AgentStore and HandoffStore with liveness tracking
- Delegation posting with urgency-based expiry and agent matching
- Context assembly integration with handoff results and agent suggestions
- Dashboard Agents tab with delegations and handoffs views

## [1.2.0] - 2026-02-17

### Added
- Embedded web dashboard with HTTP server on port 24282
- Operational stats, scope filtering, and polling-based updates
- Search and filter with `/api/search` endpoint
- Decision timeline visualization (vis-timeline)
- Knowledge graph visualization (cytoscape.js) with click-to-expand
- Dark mode with system preference detection

## [1.1.0] - 2026-02-16

### Added
- Git commit linking: `twining_link_commit`, `twining_commits`
- `twining_search_decisions` — keyword search with domain/confidence filters
- `twining_export` — full state export as markdown
- GSD planning bridge for STATE.md sync
- Serena knowledge graph enrichment workflow

## [1.0.0] - 2026-02-16

### Added
- Core blackboard engine with JSONL-backed storage and advisory file locking
- Decision engine with conflict detection, trace, reconsider, and override
- Knowledge graph with BFS traversal and entity upsert
- Embeddings layer with lazy ONNX loading and keyword fallback
- Context assembly with token budgets
- 23 MCP tools across blackboard, decisions, context, graph, and lifecycle
- Archiver for state cleanup

[1.8.1]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.8.1
[1.8.0]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.8.0
[1.7.1]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.7.1
[1.7.0]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.7.0
[1.6.5]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.6.5
[1.6.0]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.6.0
[1.5.0]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.5.0
[1.4.2]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.4.2
[1.4.1]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.4.1
[1.4.0]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.4.0
[1.3.0]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.3
[1.2.0]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.2
[1.1.0]: https://github.com/daveangulo/twining-mcp/releases/tag/v1.1
[1.0.0]: https://github.com/daveangulo/twining-mcp/releases/tag/v1
