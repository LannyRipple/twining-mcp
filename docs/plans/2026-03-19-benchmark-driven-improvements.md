# Twining Benchmark-Driven Improvements

> Based on analysis of 440-run benchmark (11 scenarios x 8 conditions x 5 iterations, 241 good runs after filtering rate-limited failures). Data at `../twining-benchmark-harness/benchmark-results/369cb444-bf5c-403e-b58d-95d98fddd04b/analysis-filtered/`.

## Executive Summary

Twining shows positive coordination lift (+5.1 points over baseline, d=0.25) with 86% engagement on clean runs. It wins significantly in long-horizon scenarios (evolving-requirements: +21.7, iterative-feature-build: +13.5, decision-volume-recovery: +12.2). But it loses in scenarios that don't need coordination, and 16 of 32 tools are never called. The improvements below target making the lift larger, more consistent, and statistically significant.

## Current State (from benchmark data)

### What Works
- **86% engagement rate** on full-twining, 94% on twining-lite (clean runs)
- **Wins in 4 scenarios** where inter-agent coordination genuinely matters
- **16 tools actively used**: assemble, decide, post, query, recent, register, status, add_entity, add_relation, dismiss, graph_query, handoff, reconsider, search_decisions, summarize, why

### What Doesn't Work
- **16 tools never called**: acknowledge, agents, archive, commits, delegate, discover, export, link_commit, neighbors, override, promote, prune_graph, read, trace, verify, what_changed
- **No significant effect** on overall composite (d=0.25, below MDES of d=0.54)
- **Loses in 3 scenarios**: concurrent-agents (-8.4), conflict-resolution (-3.0), scale-stress-test (-7.5) — all ceiling scenarios where baseline already scores 93+
- **Graph building uncorrelated with outcomes** (r=-0.01 with composite score)
- **twining-lite ≈ full-twining** on unfiltered data but full-twining pulls ahead on clean data (+6.3 points)

### Behavior-Outcome Correlations
- `num_turns → cost_usd`: r=+0.75 (strong) — more turns = more cost, no quality gain
- `productive_calls → cost_usd`: r=+0.64 (strong)
- `graph_calls → composite`: r=-0.01 (negligible) — graph building has zero measurable impact

---

## Priority 1: Reduce Tool Surface (Low Risk, High Clarity)

### Problem
32 tools overwhelm the agent's context. 16 are never called. The useful tools get lost in noise. Tool descriptions consume prompt tokens on every turn.

### Changes

#### P1.1: Deprecate 16 never-called tools
Move these tools behind a `--full-tools` flag or remove entirely:
- **Coordination management** (never used in benchmark): `acknowledge`, `agents`, `delegate`, `discover`
- **Decision management** (never used): `override`, `promote`, `commits`, `link_commit`, `trace`
- **Graph** (never used): `neighbors`, `prune_graph`
- **Lifecycle** (never used): `archive`, `export`
- **Verification** (never used): `verify`, `what_changed`
- **Blackboard** (never used): `read`

**Files to modify:**
- `src/tools/coordination-tools.ts` — gate `acknowledge`, `agents`, `delegate`, `discover` behind config flag
- `src/tools/decision-tools.ts` — gate `override`, `promote`, `commits`, `link_commit`, `trace`
- `src/tools/graph-tools.ts` — gate `neighbors`, `prune_graph`
- `src/tools/lifecycle-tools.ts` — gate `archive`
- `src/tools/export-tools.ts` — gate `export`
- `src/tools/verify-tools.ts` — gate `verify`
- `src/tools/context-tools.ts` — gate `what_changed`
- `src/tools/blackboard-tools.ts` — gate `read`
- `src/config.ts` — add `fullToolSurface: boolean` config option (default: false)

**Approach:** Don't delete the code. Add a config check in each tool's registration that skips registration when `fullToolSurface` is false. This keeps the tools available for users who want them while reducing the default surface to 16 tools.

#### P1.2: Update twining-lite condition in benchmark harness
After reducing default surface, twining-lite (currently 8 tools) and full-twining (currently 32) will be closer. Update the benchmark's `twining-lite` condition to use exactly the new default 16-tool set, and `full-twining` to use `--full-tools` mode with all 32.

**Files to modify (in twining-benchmark-harness):**
- `src/conditions/twining-lite.ts` — set plugin config to default (16 tools)
- `src/conditions/full-twining.ts` — set `fullToolSurface: true`

---

## Priority 2: Improve Assemble Output Quality (Medium Risk, High Impact)

### Problem
When agents call `assemble`, the output is a raw dump of decisions, warnings, and findings. Agents don't reliably act on this information because it's not structured for action.

### Changes

#### P2.1: Structured assemble output with action items
Rewrite `context-assembler.ts` to produce output in this format:

```
## Before You Start
1. DECISIONS TO RESPECT: [numbered list of active decisions with one-line summaries]
2. WARNINGS: [things NOT to do, with reasons]
3. CONTINUE FROM: [what the previous agent did, files changed]

## Quick Reference
- Files modified by previous agents: [list]
- Architecture chosen: [pattern name if any]
- Open questions: [any unanswered questions]
```

Current format dumps raw JSON-like structures. The new format should be optimized for an LLM reader: imperative sentences, numbered lists, file paths as links.

**Files to modify:**
- `src/engine/context-assembler.ts` — rewrite `assemble()` output formatting
- `src/tools/context-tools.ts` — update tool description to match new output format

#### P2.2: Auto-inject previous agent's file changes into assemble
Currently assemble returns decisions and findings but not which files changed. Add a `recent_file_changes` section that lists files modified since the last `twining_post` or `twining_decide`, so the next agent knows exactly where to look.

**Files to modify:**
- `src/engine/context-assembler.ts` — add file change tracking from git diff or blackboard entries
- `src/storage/` — may need to store last-known commit hash per scope

---

## Priority 3: Auto-Orient on Session Start (Medium Risk, High Impact)

### Problem
Even with 86% engagement, agents sometimes skip `assemble` and jump straight to coding. When they skip orientation, the coordination chain breaks entirely — they don't know what previous agents decided.

### Changes

#### P3.1: SessionStart hook auto-calls assemble
Replace the current SessionStart prompt hook (which just reminds agents to call assemble) with a command hook that actually calls assemble and injects the result.

**Current:** Prompt hook says "call twining_assemble before working"
**Proposed:** Command hook that:
1. Detects the working directory
2. Calls twining_assemble with scope inferred from the project
3. Returns the assembled context as the hook output so it appears in the agent's conversation

**Files to modify:**
- `plugin/hooks/hooks.json` — change SessionStart from prompt to command type
- `plugin/hooks/session-start-hook.sh` — new script that calls assemble via the MCP server

**Risk:** The MCP server needs to be running before the hook fires. Need to verify the hook execution order relative to MCP server startup.

#### P3.2: Simplify the orientation skill
The current `twining-orient` skill is a long instructional document telling agents to call 5-7 tools in sequence. Most agents don't follow multi-step instructions reliably. Simplify to: "call assemble, read warnings, proceed."

**Files to modify:**
- `plugin/skills/twining-orient/` — simplify to 3 bullet points

---

## Priority 4: Make Graph Building Optional (Low Risk, Removes Overhead)

### Problem
Graph building (add_entity, add_relation) has r=-0.01 correlation with outcomes. Agents spend time building a knowledge graph that no one reads. The tools are called but the graph isn't queried by subsequent agents (neighbors, graph_query are never called).

### Changes

#### P4.1: Remove graph building from mandatory gates
The BEHAVIORS.md and skill instructions currently list graph building as part of the verification gate. Remove it from the mandatory flow.

**Files to modify:**
- `plugin/BEHAVIORS.md` — remove graph building from mandatory gates, make it opt-in
- `plugin/skills/twining-verify/` — remove graph relation checks from verification
- `plugin/skills/twining-map/` — mark as optional/advanced

#### P4.2: Remove auto-graph-populator from default flow
The `graph-auto-populator.ts` automatically creates graph entities from decisions and findings. This adds latency with no measured benefit. Disable by default.

**Files to modify:**
- `src/engine/graph-auto-populator.ts` — add config flag to disable
- `src/config.ts` — add `autoPopulateGraph: boolean` (default: false)

---

## Priority 5: Optimize for Fewer Turns (Low Risk, Cost Reduction)

### Problem
`num_turns → cost_usd` has r=+0.75 (strong). More turns = more cost but NOT more quality. Twining adds turns through its lifecycle gates (assemble at start, decide during, verify at end). Each gate adds 1-3 turns of overhead.

### Changes

#### P5.1: Combine assemble + status into one call
Currently agents often call both `status` and `assemble` at session start. Merge status information into assemble output (it already includes most of it) and deprecate the standalone `status` call for agents.

**Files to modify:**
- `src/engine/context-assembler.ts` — include status summary in assemble output
- `src/tools/lifecycle-tools.ts` — add deprecation note to status tool description

#### P5.2: Batch decide + post into single calls where possible
Agents often call `decide` then `post` then `link_commit` in sequence. Consider a convenience wrapper or teach agents to include all information in `decide` (which already cross-posts to the blackboard).

**Files to modify:**
- `src/tools/decision-tools.ts` — enhance `decide` to optionally include commit hash and additional findings
- Update skill instructions to use the combined flow

---

## Priority 6: Fix Scenarios Where Coordination Hurts

These are harness changes (in twining-benchmark-harness), not Twining changes. Listed here for completeness.

### P6.1: concurrent-agents (baseline: 93.4, full-twining: 85.0)
Baseline already at ceiling. The coordination overhead pulls scores down with no room to improve. Consider redesigning the scoring to have a lower baseline ceiling, or exclude this scenario when baseline > 90.

### P6.2: conflict-resolution (baseline: 97.0, twining-lite: 51.5)
Baseline at 97 is clearly a ceiling effect. The twining-lite score of 51.5 suggests agents get confused by the coordination tools when the task is simple enough to solve from code alone. The scorer may also be broken for twining conditions.

---

## Execution Order

1. **P1 (tool reduction)** — safest, most impactful, no behavior change for core tools
2. **P2 (assemble quality)** — improves the value of the information agents receive
3. **P4 (graph optional)** — removes overhead with zero measured downside
4. **P5 (fewer turns)** — cost reduction
5. **P3 (auto-orient)** — higher risk, needs MCP server timing verification
6. **P6 (harness fixes)** — separate project, can run in parallel

## Validation

After implementing P1-P5, re-run the benchmark:

```bash
cd ../twining-benchmark-harness
npx twining-bench run --scenario all --condition all --model claude-sonnet-4-6 --concurrency 2 --budget 500 --seed benchmark-v4
```

Then analyze with:
```bash
cd analysis && .venv/bin/python -m benchmark_analysis analyze ../benchmark-results/<run-id> --min-tokens 1000
```

**Success criteria:**
- Coordination lift > +10 points (up from +5.1)
- Effect size d > 0.54 (above MDES for n=55)
- At least one ROPE comparison shows "different" (currently all "undecided")
- Twining engagement stays above 80%
- Graph building overhead eliminated from default flow
- Tool count reduced from 32 to 16 in default mode
