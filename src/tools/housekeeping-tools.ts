/**
 * MCP tool handler for twining_housekeeping — periodic store maintenance.
 * Dry-run by default. Pass execute: true to apply changes.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HousekeepingEngine } from "../engine/housekeeping.js";
import { toolResult, toolError } from "../utils/errors.js";

export function registerHousekeepingTools(
  server: McpServer,
  housekeepingEngine: HousekeepingEngine,
): void {
  server.registerTool(
    "twining_housekeeping",
    {
      description:
        "Run periodic maintenance on Twining stores. Preview by default (dry run). " +
        "Archives old entries, removes duplicates, surfaces stale decisions and dangling warnings, " +
        "prunes orphaned graph entities, and rotates old metrics. " +
        "Pass execute: true to apply changes.",
      inputSchema: {
        execute: z
          .boolean()
          .optional()
          .describe("Set to true to apply changes. Default is false (preview only)."),
        promote_provisionals: z
          .boolean()
          .optional()
          .describe("Set to true to auto-promote stale provisional decisions to active. Default is false (report only)."),
        stale_days: z
          .number()
          .optional()
          .describe("Flag provisional decisions older than this many days (default: 7)"),
        metrics_retention_days: z
          .number()
          .optional()
          .describe("Remove metrics older than this many days (default: 30)"),
      },
    },
    async (args) => {
      try {
        const result = await housekeepingEngine.run({
          execute: args.execute,
          promote_provisionals: args.promote_provisionals,
          stale_days: args.stale_days,
          metrics_retention_days: args.metrics_retention_days,
        });
        return toolResult(result);
      } catch (e) {
        return toolError(
          e instanceof Error ? e.message : "Unknown error",
          "INTERNAL_ERROR",
        );
      }
    },
  );
}
