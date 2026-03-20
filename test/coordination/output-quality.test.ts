/**
 * Tests for formatForLLM output quality improvements:
 * - First-500-tokens: critical signals appear early
 * - No-redundancy: decisions and findings don't duplicate
 * - Diff-from-empty: populated state adds meaningful content
 * - Imperative framing: output uses directive language
 * - Warning priority: warnings appear before decisions
 * - Handoff checklists: structured continuation items
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { createTwiningDir, createAssembler, estimateTokens } from "./helpers.js";
import { ContextAssembler } from "../../src/engine/context-assembler.js";
import * as bugInvestigation from "./fixtures/bug-investigation.js";
import * as contextRecovery from "./fixtures/context-recovery.js";
import * as architectureCascade from "./fixtures/architecture-cascade.js";
import * as conflictResolution from "./fixtures/conflict-resolution.js";
import * as refactoringHandoff from "./fixtures/refactoring-handoff.js";

let twiningDir: string;

beforeEach(() => {
  twiningDir = createTwiningDir();
});

afterEach(() => {
  fs.rmSync(twiningDir, { recursive: true, force: true });
});

describe("first-500-tokens: critical signals appear early", () => {
  it("bug-investigation: warning appears in first 500 tokens", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination bug", "src/");
    const text = ContextAssembler.formatForLLM(ctx);
    const first500 = text.slice(0, 500 * 4); // ~500 tokens at 4 chars/token
    expect(first500).toMatch(/Do NOT modify|search\.service/i);
  });

  it("context-recovery: handoff appears in first 500 tokens", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth work", "src/auth/");
    const text = ContextAssembler.formatForLLM(ctx);
    const first500 = text.slice(0, 500 * 4);
    // Either the warning or the handoff should appear early
    expect(first500).toMatch(/JWT secret|CONTINUE FROM|auth/i);
  });

  it("architecture-cascade: key decision appears in first 500 tokens", async () => {
    await architectureCascade.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("add repository", "src/repositories/");
    const text = ContextAssembler.formatForLLM(ctx);
    const first500 = text.slice(0, 500 * 4);
    expect(first500).toMatch(/repository pattern|BaseRepository/i);
  });

  it("warnings section appears before decisions section", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix bug", "src/");
    const text = ContextAssembler.formatForLLM(ctx);
    const warningsIdx = text.indexOf("STOP — READ THESE WARNINGS");
    const decisionsIdx = text.indexOf("DECISIONS TO RESPECT");
    if (warningsIdx >= 0 && decisionsIdx >= 0) {
      expect(warningsIdx).toBeLessThan(decisionsIdx);
    }
  });
});

describe("no-redundancy: decisions and findings don't duplicate", () => {
  it("findings that overlap with decisions are filtered out", async () => {
    const kit = createAssembler(twiningDir);
    // Create a decision and a finding with overlapping content
    await kit.decisions.create({
      agent_id: "a",
      domain: "implementation",
      scope: "src/mod/",
      summary: "Pagination bug is an off-by-one error in paginate() offset calculation",
      context: "Investigation",
      rationale: "The offset formula is wrong",
      constraints: [],
      alternatives: [],
      depends_on: [],
      confidence: "high",
      reversible: true,
      affected_files: ["src/mod/pagination.ts"],
      affected_symbols: [],
    });
    await kit.blackboard.append({
      agent_id: "a",
      entry_type: "finding",
      tags: [],
      scope: "src/mod/",
      // This finding substantially overlaps with the decision summary
      summary: "Pagination bug is an off-by-one error in the offset calculation",
      detail: "",
    });
    // Also add a unique finding that shouldn't be filtered
    await kit.blackboard.append({
      agent_id: "a",
      entry_type: "finding",
      tags: [],
      scope: "src/mod/",
      summary: "Performance profiling shows 200ms latency in database queries",
      detail: "",
    });

    const ctx = await kit.assembler.assemble("fix mod", "src/mod/");
    const text = ContextAssembler.formatForLLM(ctx);

    // The unique finding should appear
    expect(text).toContain("Performance profiling");
    // The FINDINGS section should NOT contain the redundant pagination finding
    const findingsSection = text.split("FINDINGS")[1] ?? "";
    expect(findingsSection).not.toMatch(/Pagination bug is an off-by-one/i);
  });

  it("non-overlapping findings are preserved", async () => {
    const kit = createAssembler(twiningDir);
    await kit.decisions.create({
      agent_id: "a",
      domain: "implementation",
      scope: "src/mod/",
      summary: "Use Redis for caching layer",
      context: "Perf",
      rationale: "Fast in-memory store",
      constraints: [],
      alternatives: [],
      depends_on: [],
      confidence: "medium",
      reversible: true,
      affected_files: [],
      affected_symbols: [],
    });
    await kit.blackboard.append({
      agent_id: "a",
      entry_type: "finding",
      tags: [],
      scope: "src/mod/",
      summary: "Database connection pool exhaustion under load",
      detail: "",
    });

    const ctx = await kit.assembler.assemble("fix mod", "src/mod/");
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text).toContain("Database connection pool");
  });
});

describe("diff-from-empty: populated state adds meaningful content", () => {
  it("empty state produces terse one-liner", async () => {
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("task", "src/");
    const text = ContextAssembler.formatForLLM(ctx);
    // Short-circuit: no sections, just a terse message
    expect(text).toContain("No prior context");
    expect(text.length).toBeLessThan(100);
  });

  it("populated state adds >3x content over empty", async () => {
    // Empty baseline
    const emptyKit = createAssembler(twiningDir);
    const emptyCtx = await emptyKit.assembler.assemble("task", "src/");
    const emptyLen = ContextAssembler.formatForLLM(emptyCtx).length;

    // Populated state
    const dir2 = createTwiningDir();
    await bugInvestigation.populate(dir2);
    const populatedKit = createAssembler(dir2);
    const populatedCtx = await populatedKit.assembler.assemble("fix bug", "src/");
    const populatedLen = ContextAssembler.formatForLLM(populatedCtx).length;

    // Populated should be at least 3x the empty boilerplate
    expect(populatedLen).toBeGreaterThan(emptyLen * 3);

    fs.rmSync(dir2, { recursive: true, force: true });
  });

  it("every major section adds actionable content", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth", "src/auth/");
    const text = ContextAssembler.formatForLLM(ctx);

    // Should have warnings, handoffs, decisions, and needs
    expect(text).toContain("STOP — READ THESE WARNINGS");
    expect(text).toContain("CONTINUE FROM PREVIOUS WORK");
    expect(text).toContain("DECISIONS TO RESPECT");
    expect(text).toContain("REMAINING WORK");
  });
});

describe("imperative framing: output uses directive language", () => {
  it("decisions show Why: instead of passive Rationale:", async () => {
    const kit = createAssembler(twiningDir);
    await kit.decisions.create({
      agent_id: "a",
      domain: "implementation",
      scope: "src/",
      summary: "Use strict mode",
      context: "Quality",
      rationale: "Prevents silent errors",
      constraints: [],
      alternatives: [],
      depends_on: [],
      confidence: "high",
      reversible: true,
      affected_files: ["src/config.ts"],
      affected_symbols: [],
    });

    const ctx = await kit.assembler.assemble("task", "src/");
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text).toContain("Why:");
    expect(text).not.toContain("Rationale:");
  });

  it("decisions show Files: on separate line for visibility", async () => {
    const kit = createAssembler(twiningDir);
    await kit.decisions.create({
      agent_id: "a",
      domain: "implementation",
      scope: "src/",
      summary: "Use repository pattern",
      context: "Architecture",
      rationale: "Clean separation",
      constraints: [],
      alternatives: [],
      depends_on: [],
      confidence: "high",
      reversible: true,
      affected_files: ["src/repos/base.ts", "src/repos/user.ts"],
      affected_symbols: [],
    });

    const ctx = await kit.assembler.assemble("task", "src/");
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text).toMatch(/Files:\s+src\/repos\/base\.ts/);
  });

  it("open needs rendered as checklist items", async () => {
    const kit = createAssembler(twiningDir);
    await kit.blackboard.append({
      agent_id: "a",
      entry_type: "need",
      tags: [],
      scope: "src/",
      summary: "Add unit tests for auth module",
      detail: "",
    });

    const ctx = await kit.assembler.assemble("task", "src/");
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text).toContain("REMAINING WORK");
    expect(text).toContain("- [ ] Add unit tests for auth module");
  });

  it("warnings section title is urgent/imperative", async () => {
    const kit = createAssembler(twiningDir);
    await kit.blackboard.append({
      agent_id: "a",
      entry_type: "warning",
      tags: [],
      scope: "src/",
      summary: "Do not modify legacy.ts",
      detail: "",
    });

    const ctx = await kit.assembler.assemble("task", "src/");
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text).toContain("STOP — READ THESE WARNINGS");
  });
});

describe("handoff checklists: structured continuation items", () => {
  it("handoff results appear as checklist with status icons", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth work", "src/auth/");
    const text = ContextAssembler.formatForLLM(ctx);

    // Completed items show [x]
    expect(text).toMatch(/\[x\].*JWT generation/i);
    // Blocked items show [BLOCKED]
    expect(text).toMatch(/\[BLOCKED\].*Refresh token/i);
  });

  it("refactoring handoff shows completed and partial items", async () => {
    await refactoringHandoff.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue refactoring", "src/services/");
    const text = ContextAssembler.formatForLLM(ctx);

    // Completed item
    expect(text).toMatch(/\[x\].*user\.service\.ts|user\.validator/i);
    // Partial item (not done)
    expect(text).toMatch(/\[ \].*order\.service\.ts|order\.validator/i);
  });

  it("handoff results include notes when present", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth", "src/auth/");
    const text = ContextAssembler.formatForLLM(ctx);

    // The blocked result has notes about what needs to happen
    expect(text).toMatch(/rotateRefresh|DB token invalidation/i);
  });

  it("handoff without results still shows summary", async () => {
    // Create a handoff with no results array
    const kit = createAssembler(twiningDir);
    await kit.handoffs.create({
      source_agent: "agent-a",
      scope: "src/",
      summary: "General project handoff with context",
      results: [],
      context_snapshot: {
        decision_ids: [],
        warning_ids: [],
        finding_ids: [],
        summaries: ["Work in progress"],
      },
    });

    const ctx = await kit.assembler.assemble("continue work", "src/");
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text).toContain("CONTINUE FROM PREVIOUS WORK");
    expect(text).toContain("General project handoff");
  });
});
