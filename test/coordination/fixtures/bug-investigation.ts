import { BlackboardStore } from "../../../src/storage/blackboard-store.js";
import { DecisionStore } from "../../../src/storage/decision-store.js";
import { GraphStore } from "../../../src/storage/graph-store.js";
import { GraphEngine } from "../../../src/engine/graph.js";

export async function populate(twiningDir: string): Promise<void> {
  const blackboard = new BlackboardStore(twiningDir);
  const decisions = new DecisionStore(twiningDir);
  const graph = new GraphEngine(new GraphStore(twiningDir));

  // Agent A's decision about the bug location
  await decisions.create({
    agent_id: "agent-a",
    domain: "implementation",
    scope: "src/utils/",
    summary: "Pagination bug is an off-by-one error in paginate() offset calculation",
    context: "Users report duplicate items on page 2 of search results",
    rationale: "The offset calculation in src/utils/pagination.ts uses (page - 1) * pageSize - 1, but the -1 is incorrect. It should be (page - 1) * pageSize. This causes page 2 to start one item too early, duplicating the last item from page 1.",
    constraints: [],
    alternatives: [
      { option: "Bug could be in search.service.ts", pros: [], cons: [], reason_rejected: "Ruled out — service just calls paginate()" },
      { option: "Bug could be in the database query", pros: [], cons: [], reason_rejected: "Ruled out — raw results are correct" },
    ],
    depends_on: [],
    confidence: "high",
    reversible: true,
    affected_files: ["src/utils/pagination.ts"],
    affected_symbols: ["paginate"],
  });

  // Finding with specific investigation details
  await blackboard.append({
    agent_id: "agent-a",
    entry_type: "finding",
    tags: ["bug", "pagination", "investigation"],
    scope: "src/utils/pagination.ts",
    summary: "Off-by-one in paginate(): offset = (page - 1) * pageSize - 1 should drop the -1",
    detail: "Line 42 of src/utils/pagination.ts. The function paginate(items, page, pageSize) calculates offset as (page - 1) * pageSize - 1. The trailing -1 causes page 2 to include the last item of page 1. Fix: remove the -1. Verified by tracing search.service.ts -> paginate() call chain.",
  });

  // Warning about what NOT to change
  await blackboard.append({
    agent_id: "agent-a",
    entry_type: "warning",
    tags: ["bug", "investigation"],
    scope: "src/services/",
    summary: "Do NOT modify search.service.ts -- the bug is in pagination.ts, not the service layer",
    detail: "search.service.ts correctly passes results to paginate(). The service layer is not the source of the duplicate results bug.",
  });

  // Need for regression test
  await blackboard.append({
    agent_id: "agent-a",
    entry_type: "need",
    tags: ["testing", "pagination"],
    scope: "src/utils/",
    summary: "Add regression test for pagination page boundaries -- test that page 2 has no items from page 1",
    detail: "",
  });

  // Graph: Agent A mapped the code relationships during investigation
  const paginationFile = await graph.addEntity({
    name: "src/utils/pagination.ts",
    type: "file",
    properties: { description: "Pagination utility" },
  });
  const paginateFn = await graph.addEntity({
    name: "paginate",
    type: "function",
    properties: { file: "src/utils/pagination.ts", line: "42" },
  });
  const searchService = await graph.addEntity({
    name: "src/services/search.service.ts",
    type: "file",
    properties: { description: "Search service" },
  });

  // paginate() is defined in pagination.ts
  await graph.addRelation({ source: paginationFile.id, target: paginateFn.id, type: "produces" });
  // search.service.ts calls paginate()
  await graph.addRelation({ source: searchService.id, target: paginateFn.id, type: "calls" });
  // The bug decision affects paginate()
  await graph.addRelation({ source: paginateFn.id, target: paginationFile.id, type: "affects" });

  // Unrelated decision (should NOT appear when assembling for src/utils/)
  await decisions.create({
    agent_id: "agent-a",
    domain: "architecture",
    scope: "src/database/",
    summary: "Use connection pooling for database queries",
    context: "Performance optimization",
    rationale: "Reduces connection overhead",
    constraints: [],
    alternatives: [],
    depends_on: [],
    confidence: "medium",
    reversible: true,
    affected_files: ["src/database/pool.ts"],
    affected_symbols: [],
  });
}
