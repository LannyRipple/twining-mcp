import { BlackboardStore } from "../../../src/storage/blackboard-store.js";
import { DecisionStore } from "../../../src/storage/decision-store.js";
import { GraphStore } from "../../../src/storage/graph-store.js";
import { GraphEngine } from "../../../src/engine/graph.js";

export async function populate(twiningDir: string): Promise<void> {
  const blackboard = new BlackboardStore(twiningDir);
  const decisions = new DecisionStore(twiningDir);
  const graph = new GraphEngine(new GraphStore(twiningDir));

  // Broad architectural decision
  await decisions.create({
    agent_id: "agent-a",
    domain: "architecture",
    scope: "src/",
    summary: "Use repository pattern for all data access",
    context: "Need consistent data access layer across services",
    rationale: "Repository pattern decouples business logic from data persistence, enables testing with in-memory implementations, and provides a clear seam for caching.",
    constraints: ["All DB access must go through repositories"],
    alternatives: [
      { option: "Active Record pattern", pros: [], cons: [], reason_rejected: "Couples domain models to persistence" },
      { option: "Direct DAO calls", pros: [], cons: [], reason_rejected: "No abstraction boundary for testing" },
    ],
    depends_on: [],
    confidence: "high",
    reversible: false,
    affected_files: ["src/repositories/"],
    affected_symbols: [],
  });

  // Mid-level implementation decision
  await decisions.create({
    agent_id: "agent-a",
    domain: "implementation",
    scope: "src/repositories/",
    summary: "All repositories extend BaseRepository with standard CRUD",
    context: "Consistency across repository implementations",
    rationale: "BaseRepository provides create/read/update/delete with transaction support. Concrete repositories add domain-specific queries.",
    constraints: [],
    alternatives: [],
    depends_on: [],
    confidence: "high",
    reversible: true,
    affected_files: ["src/repositories/base.ts", "src/repositories/user.repository.ts"],
    affected_symbols: ["BaseRepository"],
  });

  // Narrow implementation detail
  await decisions.create({
    agent_id: "agent-a",
    domain: "implementation",
    scope: "src/repositories/base.ts",
    summary: "BaseRepository uses constructor dependency injection for DB connection",
    context: "Testability and flexibility",
    rationale: "Constructor injection allows swapping DB connections in tests without mocking modules.",
    constraints: [],
    alternatives: [
      { option: "Module-level singleton", pros: [], cons: [], reason_rejected: "Hard to swap in tests" },
    ],
    depends_on: [],
    confidence: "medium",
    reversible: true,
    affected_files: ["src/repositories/base.ts"],
    affected_symbols: ["BaseRepository"],
  });

  // Finding about implementation progress
  await blackboard.append({
    agent_id: "agent-a",
    entry_type: "finding",
    tags: ["architecture", "repository"],
    scope: "src/repositories/",
    summary: "BaseRepository implemented with CRUD + transaction support in src/repositories/base.ts",
    detail: "Implements create(), findById(), update(), delete(), and withTransaction(). UserRepository extends it with findByEmail() and findByRole().",
  });

  // Graph: class hierarchy and pattern relationships
  const repoPattern = await graph.addEntity({
    name: "repository-pattern",
    type: "pattern",
    properties: { description: "Data access abstraction pattern" },
  });
  const baseRepo = await graph.addEntity({
    name: "BaseRepository",
    type: "class",
    properties: { file: "src/repositories/base.ts" },
  });
  const userRepo = await graph.addEntity({
    name: "UserRepository",
    type: "class",
    properties: { file: "src/repositories/user.repository.ts" },
  });
  const baseFile = await graph.addEntity({
    name: "src/repositories/base.ts",
    type: "file",
  });

  // BaseRepository implements the repository pattern
  await graph.addRelation({ source: baseRepo.id, target: repoPattern.id, type: "implements" });
  // UserRepository depends on (extends) BaseRepository
  await graph.addRelation({ source: userRepo.id, target: baseRepo.id, type: "depends_on" });
  // BaseRepository is in base.ts
  await graph.addRelation({ source: baseFile.id, target: baseRepo.id, type: "produces" });
  // The pattern decision affects these classes
  await graph.addRelation({ source: repoPattern.id, target: baseRepo.id, type: "affects" });
  await graph.addRelation({ source: repoPattern.id, target: userRepo.id, type: "affects" });
}
