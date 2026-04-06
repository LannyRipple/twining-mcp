## Coordination — Twining Lifecycle Gates

IMPORTANT: These gates are BLOCKING REQUIREMENTS for every task involving code exploration, modification, or architectural decisions.

### Gate 1: Context Assembly (BEFORE any work)
- MUST call `twining_assemble` with task description and narrowest scope BEFORE reading code or making changes
- MUST call `twining_why` on files you intend to modify
- NEVER start working without these calls — skipping creates blind decisions that conflict with existing work

### Gate 2: Record (BEFORE committing or ending)
- MUST call `twining_record` before every `git commit` or session end — hooks enforce this
- Include what you did (summary) and any choices you made (decisions array)
- Write decisions as natural sentences: "Chose X over Y — reason"
- For findings/warnings during work, use `twining_post` directly

### Housekeeping
- Run `twining_housekeeping({})` at the start of long sessions to check for stale state — preview is safe, execute only if needed

### Critical Rules
- Use narrowest scope: `src/auth/` not `project`
- NEVER skip Gate 1 — #1 cause of wasted work and conflicting decisions
- NEVER skip Gate 2 — hooks will block your commit and session exit until you record

---

## Twining Coordination — Workflow Details

This project uses [Twining](https://github.com/daveangulo/twining-mcp) for shared agent coordination. State lives in `.twining/` as plain files — JSONL for the blackboard, JSON for decisions and graph.

### Core Workflow

**Before modifying code (Gate 1):**
1. Call `twining_assemble` with your task description and scope
2. Call `twining_why` on files you intend to modify
3. Check for `warning` entries in your scope

**While working:**
- Post `finding` entries for surprising discoveries via `twining_post`
- Post `warning` entries for gotchas the next agent should know
- Post `need` entries for follow-up work you identify but won't do

**Before committing or ending (Gate 2):**

Call `twining_record` with everything the next session needs:

```
twining_record({
  summary: "Added Redis caching to UserService with TTL invalidation",
  decisions: [
    "Chose Redis over Memcached — need persistence across restarts",
    "Used write-through caching instead of write-behind — consistency over write latency"
  ],
  assumptions: ["Read-heavy workload (10:1 ratio)", "Cache misses acceptable during cold start"],
  constraints: ["Must not add >50ms p99 latency"],
  affected_files: ["src/services/user-service.ts", "src/cache/redis-client.ts"],
  scope: "src/services/"
})
```

For small changes, a summary is enough:
```
twining_record({ summary: "Fixed off-by-one in pagination offset", scope: "src/utils/" })
```

### Blackboard Entry Types

| Type | When to use |
|------|-------------|
| `finding` | Something discovered that others should know |
| `warning` | A gotcha, risk, or "don't do X because Y" |
| `need` | Work that should be done by someone |
| `question` | Something you need answered |
| `status` | Progress update (auto-created by `twining_record`) |

### Scope Conventions

Scopes use path-prefix semantics:
- `"project"` — matches everything (use sparingly)
- `"src/auth/"` — matches anything under the auth module
- `"src/auth/jwt.ts"` — matches a specific file

Use the narrowest scope that fits. Scope is auto-inferred from git diff if omitted from `twining_record`.

### Dashboard

The web dashboard runs on port 24282 by default — browse decisions, blackboard, knowledge graph, and agent state. Configure with:
- `TWINING_DASHBOARD=0` — disable entirely
- `TWINING_DASHBOARD_NO_OPEN=1` — prevent auto-opening browser
- `TWINING_DASHBOARD_PORT=<port>` — change the port

For the full tool reference (all 30+ tools, multi-agent patterns, delegation/handoff examples), see `docs/TWINING-REFERENCE.md`.
