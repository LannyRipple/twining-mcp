/**
 * Scenario A: 3 decisions in different scopes, assemble filters correctly.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createTmpProjectDir,
  createTestServer,
  callTool,
  parseToolResponse,
} from "../helpers.js";

let tmpDir: string;
let server: McpServer;

beforeEach(() => {
  tmpDir = createTmpProjectDir();
  server = createTestServer(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Scenario: decide then assemble with scope filtering", () => {
  it("assemble includes scope-matched decisions", async () => {
    // Create 3 decisions in different scopes
    await callTool(server, "twining_decide", {
      domain: "architecture",
      scope: "src/auth/",
      summary: "Auth uses JWT",
      context: "Need auth",
      rationale: "Stateless",
    });
    await callTool(server, "twining_decide", {
      domain: "architecture",
      scope: "src/db/",
      summary: "DB uses PostgreSQL",
      context: "Need persistence",
      rationale: "Relational data",
    });
    await callTool(server, "twining_decide", {
      domain: "testing",
      scope: "src/auth/",
      summary: "Auth tests use mocks",
      context: "Need fast tests",
      rationale: "Speed",
    });

    // Assemble for src/auth/ scope
    const res = await callTool(server, "twining_assemble", {
      task: "Work on auth module",
      scope: "src/auth/",
    });
    const parsed = parseToolResponse(res) as {
      briefing: string;
      decisions_count: number;
    };
    // Should include auth decisions in briefing
    expect(parsed.briefing).toContain("Auth uses JWT");
    expect(parsed.briefing).toContain("Auth tests use mocks");
    expect(parsed.decisions_count).toBeGreaterThanOrEqual(2);
  });
});
