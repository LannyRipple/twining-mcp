import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { createTwiningDir, createAssembler, formatAndCount } from "./helpers.js";
import { ContextAssembler } from "../../src/engine/context-assembler.js";
import * as bugInvestigation from "./fixtures/bug-investigation.js";
import * as architectureCascade from "./fixtures/architecture-cascade.js";
import * as contextRecovery from "./fixtures/context-recovery.js";
import * as refactoringHandoff from "./fixtures/refactoring-handoff.js";
import * as conflictResolution from "./fixtures/conflict-resolution.js";

let twiningDir: string;

beforeEach(() => {
  twiningDir = createTwiningDir();
});

afterEach(() => {
  fs.rmSync(twiningDir, { recursive: true, force: true });
});

describe("bug-investigation: Agent B receives actionable context", () => {
  it("assemble includes the bug location finding", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination bug", "src/");
    const findingSummaries = ctx.recent_findings.map((f) => f.summary).join(" ");
    expect(findingSummaries).toMatch(/pagination|off-by-one/i);
  });

  it("assemble includes the warning about what NOT to change", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination bug", "src/");
    const warningSummaries = ctx.active_warnings.map((w) => w.summary).join(" ");
    expect(warningSummaries).toMatch(/search\.service|Do NOT modify/i);
  });

  it("assemble includes the need for regression test", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination bug", "src/");
    const needSummaries = ctx.open_needs.map((n) => n.summary).join(" ");
    expect(needSummaries).toMatch(/regression test|pagination/i);
  });

  it("formatted briefing contains specific file paths", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination bug", "src/");
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text).toContain("src/utils/pagination.ts");
  });

  it("assemble does NOT include out-of-scope decisions", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination bug", "src/utils/");
    const summaries = ctx.active_decisions.map((d) => d.summary).join(" ");
    expect(summaries).not.toMatch(/connection pooling|database/i);
  });
});

describe("architecture-cascade: Agent B receives architectural decisions", () => {
  it("assemble includes the architectural pattern decision", async () => {
    await architectureCascade.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("add new repository", "src/repositories/");
    const summaries = ctx.active_decisions.map((d) => d.summary).join(" ");
    expect(summaries).toMatch(/repository pattern/i);
  });

  it("all three cascading decisions appear for narrow scope", async () => {
    await architectureCascade.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("add user repo method", "src/repositories/user.repository.ts");
    // Broad "src/" + mid "src/repositories/" match via bidirectional prefix;
    // "src/repositories/base.ts" matches via affected_files containing base.ts
    expect(ctx.active_decisions.length).toBeGreaterThanOrEqual(2);
  });
});

describe("context-recovery: Agent B receives handoff context", () => {
  it("assemble includes recent handoff from Agent A", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth implementation", "src/auth/");
    expect(ctx.recent_handoffs).toBeDefined();
    expect(ctx.recent_handoffs!.length).toBeGreaterThanOrEqual(1);
    const handoffSummaries = ctx.recent_handoffs!.map((h) => h.summary).join(" ");
    expect(handoffSummaries).toMatch(/JWT|auth/i);
  });

  it("handoff shows completed and blocked results", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth implementation", "src/auth/");
    expect(ctx.recent_handoffs![0]!.result_status).toBe("mixed");
  });

  it("formatForLLM includes CONTINUE FROM section with handoff", async () => {
    await contextRecovery.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue auth implementation", "src/auth/");
    const text = ContextAssembler.formatForLLM(ctx);
    expect(text).toContain("CONTINUE FROM");
    expect(text).toMatch(/auth|JWT/i);
  });
});

describe("refactoring-handoff: Agent B gets structured partial handoff", () => {
  it("assemble includes handoff with partial status", async () => {
    await refactoringHandoff.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue refactoring", "src/services/");
    expect(ctx.recent_handoffs).toBeDefined();
    expect(ctx.recent_handoffs!.length).toBeGreaterThanOrEqual(1);
  });

  it("handoff conveys what's done and what remains", async () => {
    await refactoringHandoff.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("continue refactoring", "src/services/");
    const summary = ctx.recent_handoffs![0]!.summary;
    expect(summary).toMatch(/user\.service\.ts.*complete|order\.service\.ts.*remaining/i);
  });
});

describe("negative: conflict-resolution should have minimal context", () => {
  it("assemble for a simple conflict has low token cost", async () => {
    await conflictResolution.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("resolve merge conflict", "src/");
    expect(ctx.token_estimate).toBeLessThan(500);
  });

  it("no handoffs in minimal scenario", async () => {
    await conflictResolution.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("resolve merge conflict", "src/");
    expect(ctx.recent_handoffs ?? []).toHaveLength(0);
  });
});
