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

/**
 * Explicit rationale markers — preferred over heuristic separators because they
 * are unambiguous and authored intentionally. Word-boundary, case-insensitive.
 */
const EXPLICIT_RATIONALE_MARKERS = /\b(?:Rationale|Why|Reason|Because)\s*:\s*/i;

/**
 * Heuristic fallback separators when no explicit marker is present.
 * The em-dash is the strongest visual cue and is tried first.
 */
const FALLBACK_SEPARATORS = [
  /\s+—\s+/,
  /\s+--\s+/,
  /\s+(?:because|since|due to|so that)\s+/i,
  /\s+as\s+/i,
];

/** Patterns that indicate a rejected alternative (unordered-NL style). */
const REJECTION_PATTERNS: RegExp[] = [
  /\bover\s+(.+?)(?:\s+(?:—|--|because|since|due to)|$)/gi,
  /\binstead of\s+(.+?)(?:\s+(?:—|--|because|since|due to)|$)/gi,
  /\brather than\s+(.+?)(?:\s+(?:—|--|because|since|due to)|$)/gi,
  /\bnot\s+(.+?)(?:\s+(?:—|--|because|since|due to)|$)/gi,
];

/** Labelled-list patterns for explicit rejections. */
const LABELLED_REJECTION_PATTERNS: RegExp[] = [
  // "Alternative rejected: X — reason" / "Rejected alternative: X."
  /\b(?:alternative\s+rejected|rejected\s+alternative)\s*:\s*(.+?)(?=\s*(?:\.|$|\balternative\s+rejected\b|\brejected\s+alternative\b))/gi,
  // "Rejected: X." (single)
  /\brejected\s*:\s*(.+?)(?=\.|$)/gi,
];

/**
 * Numbered-list pattern for "(1) item, (2) item, (3) item" phrasings.
 * Matches each (N) <text> up to the next (N+1) or end-of-string.
 */
const NUMBERED_LIST_PATTERN = /\((\d+)\)\s*([^()]+?)(?=\s*\(\d+\)|\.?\s*$)/g;

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

/**
 * Split text into [summary, rationale] at the first separator of the strongest
 * available kind. Explicit markers win; em-dash is next; word separators last.
 * The rationale preserves the entire remainder (no second-split truncation).
 */
function splitSummaryAndRationale(text: string): { summary: string; rationale: string } {
  const explicit = text.match(EXPLICIT_RATIONALE_MARKERS);
  if (explicit && explicit.index !== undefined) {
    const summary = text.slice(0, explicit.index).trim();
    const rationale = text.slice(explicit.index + explicit[0].length).trim();
    if (summary.length > 0 && rationale.length > 0) {
      return { summary, rationale };
    }
  }

  for (const sep of FALLBACK_SEPARATORS) {
    const match = text.match(sep);
    if (match && match.index !== undefined) {
      const summary = text.slice(0, match.index).trim();
      const rationale = text.slice(match.index + match[0].length).trim();
      if (summary.length > 0 && rationale.length > 0) {
        return { summary, rationale };
      }
    }
  }

  // No separator — rationale falls back to summary.
  const trimmed = text.trim();
  return { summary: trimmed, rationale: trimmed };
}

/** Extract rejected alternatives from the full text. */
function extractRejectedAlternatives(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string): void => {
    const cleaned = raw.trim().replace(/[.,;]+$/, "").trim();
    if (cleaned.length === 0) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cleaned);
  };

  // Labelled rejections take priority — they're the clearest signal.
  for (const pattern of LABELLED_REJECTION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) push(match[1]);
    }
  }

  // Numbered lists inside a "rejected" / "alternatives" context.
  if (/\b(?:rejected|alternatives?)\b/i.test(text)) {
    for (const match of text.matchAll(NUMBERED_LIST_PATTERN)) {
      if (match[2]) push(match[2]);
    }
  }

  // Unordered NL patterns last — skip if we already collected labelled items,
  // since those would otherwise double-count sub-phrases.
  if (out.length === 0) {
    for (const pattern of REJECTION_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        if (match[1]) push(match[1]);
      }
    }
  }

  return out;
}

export function parseDecision(text: string): ParsedDecision {
  const { summary, rationale } = splitSummaryAndRationale(text);
  const rejected = extractRejectedAlternatives(text);

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
