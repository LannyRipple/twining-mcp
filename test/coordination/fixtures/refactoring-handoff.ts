import { BlackboardStore } from "../../../src/storage/blackboard-store.js";
import { DecisionStore } from "../../../src/storage/decision-store.js";
import { HandoffStore } from "../../../src/storage/handoff-store.js";
import { AgentStore } from "../../../src/storage/agent-store.js";

export async function populate(twiningDir: string): Promise<void> {
  const blackboard = new BlackboardStore(twiningDir);
  const decisions = new DecisionStore(twiningDir);
  const handoffs = new HandoffStore(twiningDir);
  const agents = new AgentStore(twiningDir);

  // Register Agent A
  await agents.upsert({
    agent_id: "agent-a",
    capabilities: ["refactoring", "validation", "services"],
    role: "backend",
  });

  const extractDecision = await decisions.create({
    agent_id: "agent-a",
    domain: "implementation",
    scope: "src/services/",
    summary: "Extract validation logic from service layer into dedicated validators",
    context: "Services are too large; validation mixed with business logic",
    rationale: "Separating validation improves testability and makes validation rules reusable across services.",
    constraints: ["Validators must be pure functions", "Services call validators, not the other way"],
    alternatives: [
      { option: "Decorator-based validation", pros: [], cons: [], reason_rejected: "Too magical, harder to debug" },
    ],
    depends_on: [],
    confidence: "high",
    reversible: true,
    affected_files: [
      "src/services/user.service.ts",
      "src/services/order.service.ts",
      "src/validators/user.validator.ts",
      "src/validators/order.validator.ts",
    ],
    affected_symbols: [],
  });

  const finding = await blackboard.append({
    agent_id: "agent-a",
    entry_type: "finding",
    tags: ["refactoring"],
    scope: "src/services/user.service.ts",
    summary: "user.service.ts reduced from 450 to 280 lines after extracting validation to src/validators/user.validator.ts",
    detail: "validateCreateUser(), validateUpdateUser(), validateEmail() moved to validator. Service imports and calls them.",
  });

  await blackboard.append({
    agent_id: "agent-a",
    entry_type: "need",
    tags: ["refactoring"],
    scope: "src/services/order.service.ts",
    summary: "Extract validation from order.service.ts into src/validators/order.validator.ts following same pattern as user.validator.ts",
    detail: "",
  });

  // Structured handoff with mixed results — partial completion
  await handoffs.create({
    source_agent: "agent-a",
    scope: "src/services/",
    summary: "Validation extraction: user.service.ts complete, order.service.ts remaining",
    results: [
      {
        description: "Extract validation from user.service.ts to user.validator.ts",
        status: "completed",
        artifacts: ["src/validators/user.validator.ts", "src/services/user.service.ts"],
        notes: "Tests updated and passing",
      },
      {
        description: "Extract validation from order.service.ts to order.validator.ts",
        status: "partial",
        notes: "Not started — follow same pattern as user.validator.ts",
      },
    ],
    context_snapshot: {
      decision_ids: [extractDecision.id],
      warning_ids: [],
      finding_ids: [finding.id],
      summaries: [
        "Validation extraction pattern established with user.service.ts",
        "order.service.ts needs same treatment",
      ],
    },
  });
}
