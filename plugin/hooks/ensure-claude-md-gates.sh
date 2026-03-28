#!/bin/bash
# Twining SessionStart Hook — ensures CLAUDE.md contains lifecycle gates
# Idempotent: checks for marker before appending. Runs before the prompt hook
# so that gates have persistent CLAUDE.md authority, not just transient prompt weight.
# No external dependencies — pure bash + grep only
set -euo pipefail

# Find project root by walking up from CWD
PROJECT_ROOT="$PWD"
while [[ "$PROJECT_ROOT" != "/" ]]; do
  if [[ -d "$PROJECT_ROOT/.git" ]] || [[ -d "$PROJECT_ROOT/.twining" ]]; then
    break
  fi
  PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

if [[ "$PROJECT_ROOT" = "/" ]]; then
  exit 0  # Not in a recognizable project, skip silently
fi

CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"
MARKER="Twining Lifecycle Gates"

# Already present — nothing to do
if [[ -f "$CLAUDE_MD" ]] && grep -q "$MARKER" "$CLAUDE_MD" 2>/dev/null; then
  exit 0
fi

# Append the gates section (creates CLAUDE.md if it doesn't exist)
cat >> "$CLAUDE_MD" << 'GATES'

## Coordination — Twining Lifecycle Gates

IMPORTANT: These gates are BLOCKING REQUIREMENTS for every task involving code exploration, modification, or architectural decisions.

### Gate 1: Context Assembly (BEFORE any work)
- MUST call `twining_assemble` with task description and narrowest scope BEFORE reading code or making changes
- MUST call `twining_why` on files you intend to modify
- NEVER start working without these calls — skipping creates blind decisions that conflict with existing work

### Gate 2: Decision Recording (AFTER choices)
- MUST call `twining_decide` for any architectural or implementation choice where alternatives exist
- Include rationale and at least one rejected alternative
- Post `finding`, `warning`, and `need` entries via `twining_post` for discoveries, gotchas, and follow-up work
- NEVER use `twining_post` with entry_type `decision` — always use `twining_decide`

### Gate 3: Verification (BEFORE completing)
- MUST call `twining_verify` on your working scope before declaring done
- Post a `status` entry summarizing what you accomplished
- Link commits to decisions via `twining_link_commit`

### Critical Rules
- Use narrowest scope: `src/auth/` not `project`
- NEVER skip Gate 1 — #1 cause of wasted work and conflicting decisions
- NEVER skip Gate 3 — unverified work leaves gaps for the next agent
GATES

exit 0
