/**
 * MCP tool handler for twining_record — the unified recording tool.
 * Collapses twining_decide + twining_post(status) into one natural-language call.
 * Always creates a status post; optionally creates decision records and findings.
 */
import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BlackboardEngine } from "../engine/blackboard.js";
import type { DecisionEngine } from "../engine/decisions.js";
import { parseDecision } from "../engine/record-parser.js";
import { toolResult, toolError, TwiningError } from "../utils/errors.js";

/**
 * Infer scope from git diff when not explicitly provided.
 * Finds the common path prefix of changed files.
 */
function inferScopeFromGit(projectRoot: string): string | null {
  try {
    const output = execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (!output) return null;
    const files = output.split("\n").filter(Boolean);
    if (files.length === 0) return null;
    // Find common path prefix
    const parts = files[0]!.split("/");
    let prefix = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const candidate = parts.slice(0, i + 1).join("/") + "/";
      if (files.every((f) => f.startsWith(candidate))) {
        prefix = candidate;
      } else {
        break;
      }
    }
    return prefix || null;
  } catch {
    return null;
  }
}

/**
 * Parse a finding string, detecting "warning:" or "need:" prefixes for entry_type.
 * Default entry_type is "finding".
 */
function parseFinding(text: string): { entry_type: string; summary: string } {
  const lower = text.toLowerCase();
  if (lower.startsWith("warning:")) {
    return { entry_type: "warning", summary: text.slice("warning:".length).trim() };
  }
  if (lower.startsWith("need:")) {
    return { entry_type: "need", summary: text.slice("need:".length).trim() };
  }
  return { entry_type: "finding", summary: text };
}

export function registerRecordTools(
  server: McpServer,
  blackboardEngine: BlackboardEngine,
  decisionEngine: DecisionEngine,
  projectRoot: string,
): void {
  server.registerTool(
    "twining_record",
    {
      description:
        "Record what you did, any choices you made, and anything you discovered. Call before committing or ending a session. " +
        "The summary becomes a status post. Decisions become tracked records with rationale. " +
        "Findings become blackboard entries visible to future agents. Scope is auto-inferred from git diff if omitted.",
      inputSchema: {
        summary: z
          .string()
          .describe("What you did this session — one or two sentences"),
        decisions: z
          .array(z.string())
          .optional()
          .describe(
            'Choices you made, as natural sentences. E.g. ["Chose X over Y — reason", "Used pattern Z because..."]',
          ),
        findings: z
          .array(z.string())
          .optional()
          .describe(
            'Discoveries, warnings, or needs. Prefix with "warning:" or "need:" for severity. ' +
            'E.g. ["Auth tokens stored in localStorage — fails SOC2", "warning: No token rotation exists", "need: Add rate limiting before launch"]',
          ),
        assumptions: z
          .array(z.string())
          .optional()
          .describe(
            'Conditions your decisions depend on. E.g. ["Data is relational", "No strict ordering required"]',
          ),
        constraints: z
          .array(z.string())
          .optional()
          .describe(
            'What limited your options. E.g. ["Must support Node 18+", "Cannot add new dependencies"]',
          ),
        affected_files: z
          .array(z.string())
          .optional()
          .describe(
            "File paths you changed or that are affected by your decisions",
          ),
        affected_symbols: z
          .array(z.string())
          .optional()
          .describe(
            "Function/class/method names affected by your decisions",
          ),
        depends_on: z
          .array(z.string())
          .optional()
          .describe(
            "IDs of prior decisions that your decisions depend on (from twining_assemble or twining_why output)",
          ),
        supersedes: z
          .string()
          .optional()
          .describe(
            "ID of a prior decision that your work replaces or invalidates",
          ),
        reversible: z
          .boolean()
          .optional()
          .describe("Whether your decisions are easily reversible (default: true)"),
        commit_hash: z
          .string()
          .optional()
          .describe("Git commit hash to associate with these decisions"),
        scope: z
          .string()
          .optional()
          .describe('Area of codebase affected. Auto-inferred from git diff if omitted.'),
        agent_id: z
          .string()
          .optional()
          .describe("Agent identifier (default: main)"),
      },
    },
    async (args) => {
      try {
        // Auto-infer scope from git diff if not provided
        const scope = args.scope ?? inferScopeFromGit(projectRoot) ?? "project";
        const agentId = args.agent_id ?? "main";
        const createdDecisions: Array<{ id: string; summary: string }> = [];
        const createdFindings: Array<{ id: string; entry_type: string; summary: string }> = [];

        // 1. Always create a status post
        const detailParts: string[] = [];
        if (args.decisions?.length) detailParts.push(`Decisions: ${args.decisions.join("; ")}`);
        if (args.findings?.length) detailParts.push(`Findings: ${args.findings.join("; ")}`);

        const statusEntry = await blackboardEngine.post({
          entry_type: "status",
          summary: args.summary,
          detail: detailParts.join("\n"),
          tags: ["session-record"],
          scope,
          agent_id: agentId,
        });

        // 2. Create decision records from natural language
        if (args.decisions?.length) {
          for (const text of args.decisions) {
            const parsed = parseDecision(text);
            try {
              const decision = await decisionEngine.decide({
                domain: parsed.domain,
                scope,
                summary: parsed.summary,
                context: args.summary,
                rationale: parsed.rationale,
                alternatives: parsed.rejected_alternatives.map((alt) => ({
                  option: alt,
                  reason_rejected: "Not chosen",
                })),
                assumptions: args.assumptions,
                constraints: args.constraints,
                depends_on: args.depends_on,
                supersedes: args.supersedes,
                reversible: args.reversible,
                confidence: "medium",
                affected_files: args.affected_files ?? [],
                affected_symbols: args.affected_symbols ?? [],
                commit_hash: args.commit_hash,
                agent_id: agentId,
              });
              createdDecisions.push({
                id: decision.id,
                summary: parsed.summary,
              });
            } catch {
              // Decision creation failure is non-fatal — status post is the minimum
            }
          }
        }

        // 3. Create finding/warning/need entries
        if (args.findings?.length) {
          for (const text of args.findings) {
            const parsed = parseFinding(text);
            try {
              const entry = await blackboardEngine.post({
                entry_type: parsed.entry_type,
                summary: parsed.summary,
                detail: "",
                tags: ["session-record"],
                scope,
                agent_id: agentId,
              });
              createdFindings.push({
                id: entry.id,
                entry_type: parsed.entry_type,
                summary: parsed.summary,
              });
            } catch {
              // Non-fatal
            }
          }
        }

        const parts: string[] = ["Recorded status"];
        if (createdDecisions.length > 0) parts.push(`${createdDecisions.length} decision(s)`);
        if (createdFindings.length > 0) parts.push(`${createdFindings.length} finding(s)`);

        return toolResult({
          status_entry_id: statusEntry.id,
          decisions_created: createdDecisions,
          findings_created: createdFindings,
          scope,
          message: parts.join(" + "),
        });
      } catch (e) {
        if (e instanceof TwiningError) {
          return toolError(e.message, e.code);
        }
        return toolError(
          e instanceof Error ? e.message : "Unknown error",
          "INTERNAL_ERROR",
        );
      }
    },
  );
}
