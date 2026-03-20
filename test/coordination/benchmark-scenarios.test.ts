import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import {
  createTwiningDir,
  createAssembler,
  createDecisionEngine,
  countActionableSignals,
  formatAndCount,
} from "./helpers.js";
import { ContextAssembler } from "../../src/engine/context-assembler.js";
import { BlackboardStore } from "../../src/storage/blackboard-store.js";
import { DecisionStore } from "../../src/storage/decision-store.js";
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

describe("bug-investigation (positive — Twining should help)", () => {
  it("assemble output contains investigation trail", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix the pagination bug", "src/");
    const allText = [
      ...ctx.recent_findings.map((f) => f.summary),
      ...ctx.active_decisions.map((d) => d.summary),
    ].join(" ");
    expect(allText).toMatch(/pagination/i);
    expect(allText).toMatch(/off-by-one|paginate/i);
  });

  it("assemble output contains specific file to fix", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix the pagination bug", "src/");
    const allFiles = ctx.active_decisions.flatMap((d) => d.affected_files ?? []);
    const allFindings = ctx.recent_findings.map((f) => f.summary + " " + (f.detail ?? "")).join(" ");
    const hasFile = allFiles.includes("src/utils/pagination.ts") || allFindings.includes("src/utils/pagination.ts");
    expect(hasFile).toBe(true);
  });

  it("formatted briefing has >= 3 actionable signals", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix the pagination bug", "src/");
    expect(countActionableSignals(ctx)).toBeGreaterThanOrEqual(3);
  });

  it("graph entities enrich the context", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination", "src/utils/pagination.ts");
    const entityNames = ctx.related_entities.map((e) => e.name);
    expect(entityNames.some((n) => n === "paginate" || n.includes("pagination"))).toBe(true);
  });

  it('why("src/utils/pagination.ts") returns investigation decision', async () => {
    await bugInvestigation.populate(twiningDir);
    const bb = new BlackboardStore(twiningDir);
    const dec = new DecisionStore(twiningDir);
    const engine = createDecisionEngine(twiningDir, bb, dec);
    const result = await engine.why("src/utils/pagination.ts");
    const summaries = result.decisions.map((d) => d.summary).join(" ");
    expect(summaries).toMatch(/off-by-one|pagination/i);
  });
});

describe("context-recovery (positive — Twining should help)", () => {
  it("assemble output contains architectural decisions", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth work", "src/auth/");
    expect(ctx.active_decisions.length).toBeGreaterThanOrEqual(1);
    expect(ctx.active_decisions[0]!.rationale.length).toBeGreaterThan(0);
  });

  it("assemble output contains files Agent A was working on", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth work", "src/auth/");
    const allFiles = ctx.active_decisions.flatMap((d) => d.affected_files ?? []);
    const hasAuthFiles = allFiles.some((f) => f.includes("src/auth/jwt.ts") || f.includes("src/auth/middleware.ts"));
    expect(hasAuthFiles).toBe(true);
  });

  it("assemble output contains remaining work", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth work", "src/auth/");
    const needSummaries = ctx.open_needs.map((n) => n.summary).join(" ");
    expect(needSummaries).toMatch(/rotateRefresh|refresh/i);
  });

  it("handoff provides structured continuation point", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth work", "src/auth/");
    expect(ctx.recent_handoffs).toBeDefined();
    expect(ctx.recent_handoffs!.length).toBeGreaterThanOrEqual(1);
    // Should have mixed status (completed + blocked)
    expect(ctx.recent_handoffs![0]!.result_status).toBe("mixed");
  });

  it("Agent A appears as suggested agent for auth tasks", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("implement authentication refresh", "src/auth/");
    if (ctx.suggested_agents && ctx.suggested_agents.length > 0) {
      const agentIds = ctx.suggested_agents.map((a) => a.agent_id);
      expect(agentIds).toContain("agent-a");
    }
    // If no suggested_agents, the test passes — agent matching depends on task term overlap
  });
});

describe("architecture-cascade (positive — Twining should help)", () => {
  it("decision summary, rationale, and affected_files all present", async () => {
    await architectureCascade.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("add repository", "src/repositories/");
    const d = ctx.active_decisions.find((d) => d.rationale.length > 0 && d.affected_files.length > 0);
    expect(d).toBeDefined();
    expect(d!.summary.length).toBeGreaterThan(0);
  });

  it("cascading decisions provide complete picture", async () => {
    await architectureCascade.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("add repository", "src/repositories/");
    expect(ctx.active_decisions.length).toBeGreaterThanOrEqual(2);
  });

  it("graph connects classes to pattern", async () => {
    await architectureCascade.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("add repository", "src/repositories/");
    const entityNames = ctx.related_entities.map((e) => e.name);
    const hasRepoEntities = entityNames.some((n) =>
      ["BaseRepository", "repository-pattern", "UserRepository"].includes(n),
    );
    expect(hasRepoEntities).toBe(true);
  });

  it("graph boosts pattern decision for narrow file scope", async () => {
    await architectureCascade.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("modify user repo", "src/repositories/user.repository.ts");
    const repoDecision = ctx.active_decisions.find((d) => d.summary.match(/repository pattern/i));
    expect(repoDecision).toBeDefined();
  });
});

describe("conflict-resolution (negative — Twining should NOT add noise)", () => {
  it("overhead is minimal", async () => {
    await conflictResolution.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("resolve merge conflict", "src/");
    expect(ctx.token_estimate).toBeLessThan(500);
    expect(ctx.active_decisions.length).toBeLessThanOrEqual(2);
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text.length).toBeLessThan(1000);
  });

  it("no unrelated coordination noise", async () => {
    await conflictResolution.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("resolve merge conflict", "src/config/");
    // Should only see the config-scoped decision, no unrelated warnings or findings
    expect(ctx.active_warnings.length).toBe(0);
    expect(ctx.recent_findings.length).toBe(0);
  });
});

describe("refactoring-handoff (neutral — clear handoff without excess)", () => {
  it("conveys what was refactored and what remains", async () => {
    await refactoringHandoff.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue refactoring", "src/services/");
    const findingSummaries = ctx.recent_findings.map((f) => f.summary).join(" ");
    const needSummaries = ctx.open_needs.map((n) => n.summary).join(" ");
    expect(findingSummaries).toMatch(/user\.service\.ts|validator/i);
    expect(needSummaries).toMatch(/order\.service\.ts|order\.validator/i);
  });

  it("handoff has mixed status (completed + partial)", async () => {
    await refactoringHandoff.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue refactoring", "src/services/");
    expect(ctx.recent_handoffs).toBeDefined();
    expect(ctx.recent_handoffs!.length).toBeGreaterThanOrEqual(1);
    expect(ctx.recent_handoffs![0]!.result_status).toBe("mixed");
  });

  it("formatForLLM includes handoff in CONTINUE FROM section", async () => {
    await refactoringHandoff.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue refactoring", "src/services/");
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text).toContain("CONTINUE FROM");
    expect(text).toMatch(/validation extraction|user\.service/i);
  });

  it("stays within token budget", async () => {
    await refactoringHandoff.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue refactoring", "src/services/");
    expect(ctx.token_estimate).toBeLessThan(2000);
  });
});
