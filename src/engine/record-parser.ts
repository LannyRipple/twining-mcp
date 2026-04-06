/**
 * Parses natural language decision strings into structured decision input.
 *
 * Examples:
 *   "Chose Redis over Memcached — need persistence across restarts"
 *   "Used event-driven pattern instead of callbacks for notifications"
 *   "Reverted the workaround — root cause was fixed upstream"
 */

export interface ParsedDecision {
  summary: string;
  rationale: string;
  rejected_alternatives: string[];
  domain: string;
}

/** Separators between summary and rationale. */
const RATIONALE_SEPARATORS = /\s+(?:—|--|because|since|due to|as|so that)\s+/i;

/** Patterns that indicate a rejected alternative. */
const REJECTION_PATTERNS = [
  /\bover\s+(.+?)(?:\s+(?:—|--|because|since|due to|$))/i,
  /\binstead of\s+(.+?)(?:\s+(?:—|--|because|since|due to|$))/i,
  /\brather than\s+(.+?)(?:\s+(?:—|--|because|since|due to|$))/i,
  /\bnot\s+(.+?)(?:\s+(?:—|--|because|since|due to|$))/i,
];

/** Keywords that hint at a domain. */
const DOMAIN_HINTS: Record<string, string[]> = {
  architecture: ["pattern", "architecture", "event-driven", "microservice", "monolith", "layer", "decouple"],
  security: ["auth", "jwt", "oauth", "token", "encrypt", "permission", "rbac"],
  performance: ["cache", "redis", "memcached", "index", "optimize", "latency", "batch"],
  "data-model": ["schema", "migration", "table", "column", "relation", "model", "entity"],
  "api-design": ["endpoint", "rest", "graphql", "grpc", "route", "api"],
  testing: ["test", "mock", "stub", "fixture", "coverage", "spec"],
  deployment: ["deploy", "docker", "k8s", "ci", "cd", "pipeline", "terraform"],
  implementation: [], // default fallback
};

export function parseDecision(text: string): ParsedDecision {
  // Split on rationale separator
  const parts = text.split(RATIONALE_SEPARATORS, 2);
  const summary = (parts[0] ?? text).trim();
  const rationale = parts.length > 1 ? (parts[1] ?? "").trim() : summary;

  // Extract rejected alternatives
  const rejected: string[] = [];
  for (const pattern of REJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      rejected.push(match[1].trim());
    }
  }

  // Infer domain from keywords
  const lower = text.toLowerCase();
  let domain = "implementation";
  for (const [d, keywords] of Object.entries(DOMAIN_HINTS)) {
    if (keywords.some((k) => lower.includes(k))) {
      domain = d;
      break;
    }
  }

  return { summary, rationale, rejected_alternatives: rejected, domain };
}
