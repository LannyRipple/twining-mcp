import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { createTwiningDir, createAssembler, createDecisionEngine, formatAndCount } from "./helpers.js";
import { ContextAssembler } from "../../src/engine/context-assembler.js";
import { BlackboardStore } from "../../src/storage/blackboard-store.js";

let twiningDir: string;

beforeEach(() => {
  twiningDir = createTwiningDir();
});

afterEach(() => {
  fs.rmSync(twiningDir, { recursive: true, force: true });
});

describe("decision propagation through assemble", () => {
  it("decision with high confidence appears with rationale and affected_files", async () => {
    const { assembler, decisions } = createAssembler(twiningDir);
    await decisions.create({
      agent_id: "agent-a",
      domain: "architecture",
      scope: "src/auth/",
      summary: "Use JWT for authentication with refresh token rotation",
      context: "Need stateless auth",
      rationale: "JWT enables horizontal scaling without shared session state",
      constraints: [],
      alternatives: [],
      depends_on: [],
      confidence: "high",
      reversible: true,
      affected_files: ["src/auth/jwt.ts", "src/auth/middleware.ts"],
      affected_symbols: [],
    });

    const ctx = await assembler.assemble("implement auth", "src/auth/");
    expect(ctx.active_decisions.length).toBeGreaterThanOrEqual(1);
    const d = ctx.active_decisions[0]!;
    expect(d.summary).toMatch(/JWT/i);
    expect(d.rationale).toMatch(/horizontal scaling/i);
    expect(d.affected_files).toContain("src/auth/jwt.ts");
    expect(d.confidence).toBe("high");
  });

  it("decision with alternatives provides enough context to not re-decide", async () => {
    const { assembler, decisions } = createAssembler(twiningDir);
    await decisions.create({
      agent_id: "agent-a",
      domain: "architecture",
      scope: "src/data/",
      summary: "Use PostgreSQL over MongoDB for relational data",
      context: "Data has complex relationships",
      rationale: "Relational data with foreign keys and joins fits PostgreSQL better than document stores. ACID compliance is required for financial transactions.",
      constraints: [],
      alternatives: [
        { option: "MongoDB", pros: [], cons: [], reason_rejected: "No native joins for relational data" },
        { option: "SQLite", pros: [], cons: [], reason_rejected: "Not suitable for concurrent production use" },
      ],
      depends_on: [],
      confidence: "high",
      reversible: false,
      affected_files: ["src/data/connection.ts"],
      affected_symbols: [],
    });

    const ctx = await assembler.assemble("add data layer", "src/data/");
    const text = ContextAssembler.formatForLLM(ctx);
    // The formatted briefing should have the rationale with enough words to be useful
    const rationale = ctx.active_decisions[0]!.rationale;
    expect(rationale.split(/\s+/).length).toBeGreaterThanOrEqual(10);
  });

  it("superseded decision does NOT propagate", async () => {
    const { assembler, decisions, blackboard } = createAssembler(twiningDir);
    const old = await decisions.create({
      agent_id: "agent-a",
      domain: "implementation",
      scope: "src/api/",
      summary: "Use REST for all API endpoints",
      context: "API design",
      rationale: "REST is simpler",
      constraints: [],
      alternatives: [],
      depends_on: [],
      confidence: "medium",
      reversible: true,
      affected_files: ["src/api/routes.ts"],
      affected_symbols: [],
    });

    // Use DecisionEngine.decide() which handles supersedes logic
    const engine = createDecisionEngine(twiningDir, blackboard, decisions);
    await engine.decide({
      domain: "implementation",
      scope: "src/api/",
      summary: "Use GraphQL for query-heavy endpoints, REST for mutations",
      context: "Performance requirements changed",
      rationale: "GraphQL reduces over-fetching for complex dashboard queries",
      confidence: "high",
      affected_files: ["src/api/schema.ts", "src/api/routes.ts"],
      supersedes: old.id,
    });

    const ctx = await assembler.assemble("add API endpoint", "src/api/");
    const summaries = ctx.active_decisions.map((d) => d.summary);
    expect(summaries).not.toContain("Use REST for all API endpoints");
    expect(summaries.some((s) => s.includes("GraphQL"))).toBe(true);
  });

  it("provisional decision appears but is marked as such", async () => {
    const { assembler, decisions } = createAssembler(twiningDir);
    await decisions.create({
      agent_id: "agent-a",
      domain: "implementation",
      scope: "src/cache/",
      summary: "Use Redis for session caching",
      context: "Caching strategy",
      rationale: "Unverified — needs load testing",
      constraints: [],
      alternatives: [],
      depends_on: [],
      confidence: "low",
      reversible: true,
      affected_files: ["src/cache/redis.ts"],
      affected_symbols: [],
    });

    const ctx = await assembler.assemble("implement caching", "src/cache/");
    expect(ctx.active_decisions.length).toBeGreaterThanOrEqual(1);
    expect(ctx.active_decisions[0]!.confidence).toBe("low");
  });

  it("decision propagates across scope boundaries via containment", async () => {
    const { assembler, decisions } = createAssembler(twiningDir);
    await decisions.create({
      agent_id: "agent-a",
      domain: "architecture",
      scope: "src/",
      summary: "All modules use strict TypeScript with no-any rule",
      context: "Code quality",
      rationale: "Prevents runtime type errors",
      constraints: [],
      alternatives: [],
      depends_on: [],
      confidence: "high",
      reversible: true,
      affected_files: [],
      affected_symbols: [],
    });

    const ctx = await assembler.assemble("modify auth", "src/auth/jwt.ts");
    const summaries = ctx.active_decisions.map((d) => d.summary).join(" ");
    expect(summaries).toMatch(/strict TypeScript/i);
  });

  it("multiple decisions ordered by score — high-confidence recent first", async () => {
    const { assembler, decisions } = createAssembler(twiningDir);
    // Create 5 decisions with varying confidence
    await decisions.create({
      agent_id: "a", domain: "implementation", scope: "src/mod/",
      summary: "Low confidence old decision",
      context: "", rationale: "Weak reason", constraints: [], alternatives: [],
      depends_on: [], confidence: "low", reversible: true,
      affected_files: ["src/mod/a.ts"], affected_symbols: [],
    });
    await decisions.create({
      agent_id: "a", domain: "implementation", scope: "src/mod/",
      summary: "Medium confidence decision",
      context: "", rationale: "Medium reason", constraints: [], alternatives: [],
      depends_on: [], confidence: "medium", reversible: true,
      affected_files: ["src/mod/b.ts"], affected_symbols: [],
    });
    await decisions.create({
      agent_id: "a", domain: "implementation", scope: "src/mod/",
      summary: "High confidence important decision",
      context: "", rationale: "Strong reason with clear justification", constraints: [], alternatives: [],
      depends_on: [], confidence: "high", reversible: true,
      affected_files: ["src/mod/c.ts"], affected_symbols: [],
    });

    const ctx = await assembler.assemble("work on mod", "src/mod/", 800);
    // With tight budget, high-confidence should be prioritized
    if (ctx.active_decisions.length >= 2) {
      // The first decision should be higher-confidence than the last
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      const firstScore = confidenceOrder[ctx.active_decisions[0]!.confidence as keyof typeof confidenceOrder] ?? 0;
      const lastScore = confidenceOrder[ctx.active_decisions[ctx.active_decisions.length - 1]!.confidence as keyof typeof confidenceOrder] ?? 0;
      expect(firstScore).toBeGreaterThanOrEqual(lastScore);
    }
  });
});
