import { DecisionStore } from "../../../src/storage/decision-store.js";

export async function populate(twiningDir: string): Promise<void> {
  const decisions = new DecisionStore(twiningDir);

  // Just one simple decision — this scenario shouldn't have much coordination state
  await decisions.create({
    agent_id: "agent-a",
    domain: "implementation",
    scope: "src/config/",
    summary: "Config values use camelCase keys",
    context: "Consistency in configuration",
    rationale: "Matches TypeScript naming conventions",
    constraints: [],
    alternatives: [],
    depends_on: [],
    confidence: "medium",
    reversible: true,
    affected_files: ["src/config/settings.ts"],
    affected_symbols: [],
  });
}
