import { BlackboardStore } from "../../../src/storage/blackboard-store.js";
import { DecisionStore } from "../../../src/storage/decision-store.js";
import { HandoffStore } from "../../../src/storage/handoff-store.js";
import { AgentStore } from "../../../src/storage/agent-store.js";

export async function populate(twiningDir: string): Promise<void> {
  const blackboard = new BlackboardStore(twiningDir);
  const decisions = new DecisionStore(twiningDir);
  const handoffs = new HandoffStore(twiningDir);
  const agents = new AgentStore(twiningDir);

  // Register Agent A with auth-related capabilities
  await agents.upsert({
    agent_id: "agent-a",
    capabilities: ["authentication", "security", "jwt"],
    role: "backend",
    description: "Auth module implementer",
  });

  const jwtDecision = await decisions.create({
    agent_id: "agent-a",
    domain: "architecture",
    scope: "src/auth/",
    summary: "Use JWT for authentication with refresh token rotation",
    context: "Need stateless auth for horizontal scaling",
    rationale: "JWT enables horizontal scaling without shared session state. Refresh token rotation prevents token theft from being permanent.",
    constraints: ["Access tokens expire in 15 minutes", "Refresh tokens are single-use"],
    alternatives: [
      { option: "Session-based auth", pros: [], cons: [], reason_rejected: "Requires shared session store for horizontal scaling" },
      { option: "JWT without refresh rotation", pros: [], cons: [], reason_rejected: "Stolen tokens remain valid until expiry" },
    ],
    depends_on: [],
    confidence: "high",
    reversible: true,
    affected_files: ["src/auth/jwt.ts", "src/auth/middleware.ts", "src/auth/refresh.ts"],
    affected_symbols: ["generateToken", "verifyToken", "rotateRefresh"],
  });

  const warning = await blackboard.append({
    agent_id: "agent-a",
    entry_type: "warning",
    tags: ["auth", "security"],
    scope: "src/auth/",
    summary: "Do NOT store JWT secret in code — must come from environment variable AUTH_JWT_SECRET",
    detail: "Previous version had hardcoded secret. The env var approach is already wired in jwt.ts.",
  });

  await blackboard.append({
    agent_id: "agent-a",
    entry_type: "need",
    tags: ["auth", "implementation"],
    scope: "src/auth/refresh.ts",
    summary: "Implement rotateRefresh() — single-use refresh token rotation with DB token invalidation",
    detail: "",
  });

  // Structured handoff — Agent A's session is ending, hands off to next agent
  await handoffs.create({
    source_agent: "agent-a",
    target_agent: "agent-b",
    scope: "src/auth/",
    summary: "Auth module partially implemented. JWT generation/verification done, refresh rotation remaining.",
    results: [
      {
        description: "JWT generation and verification in src/auth/jwt.ts",
        status: "completed",
        artifacts: ["src/auth/jwt.ts", "src/auth/middleware.ts"],
      },
      {
        description: "Refresh token rotation in src/auth/refresh.ts",
        status: "blocked",
        notes: "Not started — needs rotateRefresh() with DB token invalidation",
      },
    ],
    context_snapshot: {
      decision_ids: [jwtDecision.id],
      warning_ids: [warning.id],
      finding_ids: [],
      summaries: ["JWT auth chosen for horizontal scaling", "Refresh rotation not yet implemented"],
    },
  });
}
