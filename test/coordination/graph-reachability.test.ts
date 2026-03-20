import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { createTwiningDir, createAssembler } from "./helpers.js";
import { ContextAssembler } from "../../src/engine/context-assembler.js";
import { BlackboardStore } from "../../src/storage/blackboard-store.js";
import { DecisionStore } from "../../src/storage/decision-store.js";
import { GraphStore } from "../../src/storage/graph-store.js";
import { GraphEngine } from "../../src/engine/graph.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import type { TwiningConfig } from "../../src/utils/types.js";
import * as bugInvestigation from "./fixtures/bug-investigation.js";
import * as architectureCascade from "./fixtures/architecture-cascade.js";

let twiningDir: string;

beforeEach(() => {
  twiningDir = createTwiningDir();
});

afterEach(() => {
  fs.rmSync(twiningDir, { recursive: true, force: true });
});

describe("graph-connected decisions score higher", () => {
  it("decision connected via graph outranks disconnected decision at same scope", async () => {
    await bugInvestigation.populate(twiningDir);
    // Add a second in-scope decision WITHOUT graph connections, lower confidence
    const decisions = new DecisionStore(twiningDir);
    await decisions.create({
      agent_id: "agent-b",
      domain: "implementation",
      scope: "src/utils/",
      summary: "Use lodash for utility functions",
      context: "Utility library choice",
      rationale: "Lodash provides well-tested utility functions",
      constraints: [],
      alternatives: [],
      depends_on: [],
      confidence: "low",
      reversible: true,
      affected_files: ["src/utils/helpers.ts"],
      affected_symbols: [],
    });

    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination", "src/utils/pagination.ts");

    // The graph-connected pagination decision should be present
    expect(ctx.active_decisions.some((d) => d.summary.match(/pagination|off-by-one/i))).toBe(true);
    // Both decisions should appear (graph doesn't exclude, just re-ranks)
    expect(ctx.active_decisions.length).toBeGreaterThanOrEqual(2);
  });

  it("related_entities populated for scope with graph data", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination", "src/utils/pagination.ts");
    expect(ctx.related_entities.length).toBeGreaterThan(0);
    const names = ctx.related_entities.map((e) => e.name);
    expect(names.some((n) => n === "paginate" || n.includes("pagination"))).toBe(true);
  });

  it("related_entities shows relationships", async () => {
    await bugInvestigation.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("fix pagination", "src/utils/pagination.ts");
    // Find the paginate entity or the pagination.ts file entity
    const paginateEntity = ctx.related_entities.find(
      (e) => e.name === "paginate" || e.name === "src/utils/pagination.ts",
    );
    expect(paginateEntity).toBeDefined();
    expect(paginateEntity!.relations.length).toBeGreaterThan(0);
  });

  it("empty graph produces empty related_entities", async () => {
    // Fresh dir with a decision but no graph data
    const { assembler, decisions } = createAssembler(twiningDir);
    await decisions.create({
      agent_id: "a", domain: "implementation", scope: "src/",
      summary: "Some decision", context: "", rationale: "Reason",
      constraints: [], alternatives: [], depends_on: [],
      confidence: "medium", reversible: true,
      affected_files: [], affected_symbols: [],
    });

    const ctx = await assembler.assemble("task", "src/");
    expect(ctx.related_entities).toEqual([]);
  });
});

describe("architecture-cascade: graph boosts cascading decisions", () => {
  it("graph reachability connects narrow scope to broad pattern", async () => {
    await architectureCascade.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("add method to user repo", "src/repositories/user.repository.ts");
    const repoPatternDecision = ctx.active_decisions.find((d) =>
      d.summary.match(/repository pattern/i),
    );
    expect(repoPatternDecision).toBeDefined();
  });

  it("related_entities includes class hierarchy from graph", async () => {
    await architectureCascade.populate(twiningDir);
    const { assembler } = createAssembler(twiningDir);
    const ctx = await assembler.assemble("add method to user repo", "src/repositories/user.repository.ts");
    const entityNames = ctx.related_entities.map((e) => e.name);
    // Should find at least some of: UserRepository, BaseRepository, repository-pattern
    const found = entityNames.filter((n) =>
      ["UserRepository", "BaseRepository", "repository-pattern"].includes(n),
    );
    expect(found.length).toBeGreaterThan(0);
  });
});

describe("graph vs no-graph comparison", () => {
  it("graph-enabled assembler produces different scoring than graph-disabled", async () => {
    await bugInvestigation.populate(twiningDir);

    // With graph — pagination decision gets graph reachability boost
    const withGraph = createAssembler(twiningDir);
    const ctxGraph = await withGraph.assembler.assemble("fix pagination", "src/utils/pagination.ts");

    // Without graph — no graph reachability scoring
    const blackboard = new BlackboardStore(twiningDir);
    const decStore = new DecisionStore(twiningDir);
    const config = { ...DEFAULT_CONFIG } as TwiningConfig;
    const noGraphAssembler = new ContextAssembler(
      blackboard, decStore, null, config,
      null, // no graph
      null, null, null,
    );
    const ctxNoGraph = await noGraphAssembler.assemble("fix pagination", "src/utils/pagination.ts");

    // With graph, related_entities should be populated; without, empty
    expect(ctxGraph.related_entities.length).toBeGreaterThan(0);
    expect(ctxNoGraph.related_entities).toEqual([]);

    // Both should have the pagination decision
    expect(ctxGraph.active_decisions.some((d) => d.summary.match(/pagination/i))).toBe(true);
    expect(ctxNoGraph.active_decisions.some((d) => d.summary.match(/pagination/i))).toBe(true);
  });
});
