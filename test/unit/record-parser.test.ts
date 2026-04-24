import { describe, it, expect } from "vitest";
import { parseDecision } from "../../src/engine/record-parser.js";

describe("parseDecision — existing behavior (regression)", () => {
  it("splits summary and rationale on em-dash", () => {
    const parsed = parseDecision(
      "Chose Redis over Memcached — need persistence across restarts",
    );
    expect(parsed.summary).toBe("Chose Redis over Memcached");
    expect(parsed.rationale).toBe("need persistence across restarts");
  });

  it("detects 'over X' rejected alternative", () => {
    const parsed = parseDecision(
      "Chose Redis over Memcached — need persistence across restarts",
    );
    expect(parsed.rejected_alternatives).toContain("Memcached");
  });

  it("detects 'instead of X' rejected alternative", () => {
    const parsed = parseDecision(
      "Used event-driven pattern instead of callbacks because cleaner",
    );
    expect(parsed.rejected_alternatives).toContain("callbacks");
  });

  it("falls back to summary as rationale when no separator", () => {
    const parsed = parseDecision("Reverted the workaround");
    expect(parsed.summary).toBe("Reverted the workaround");
    expect(parsed.rationale).toBe("Reverted the workaround");
  });
});

describe("parseDecision — multi-separator preservation (bug fix)", () => {
  it("does not drop content after the second rationale separator", () => {
    // Prior behavior: split(regex, 2) silently dropped everything after
    // the second match. With the fix, the full rationale is preserved.
    const text =
      "Chose event-driven over callbacks — cleaner composition, and it scales as load grows";
    const parsed = parseDecision(text);
    // Summary is before the first separator (em-dash).
    expect(parsed.summary).toBe("Chose event-driven over callbacks");
    // Rationale must contain the tail beyond the second " as " separator.
    expect(parsed.rationale).toContain("scales");
    expect(parsed.rationale).toContain("load grows");
  });

  it("preserves a long multi-sentence rationale when a mid-sentence word would otherwise split it", () => {
    const text =
      "Benchmark scope is the macro loop — evaluation across multiple sprints and releases on a sustained codebase. The unit of evaluation is the codebase over time, not single sessions. Agent Teams is reframed as a tool inside the inner loop (orthogonal to substrate choice).";
    const parsed = parseDecision(text);
    expect(parsed.summary).toBe("Benchmark scope is the macro loop");
    // Content past the second separator (" as ") must survive.
    expect(parsed.rationale).toContain("a tool inside the inner loop");
    expect(parsed.rationale).toContain("substrate choice");
  });
});

describe("parseDecision — explicit Rationale/Why/Reason markers (bug fix)", () => {
  it("prefers an explicit 'Rationale:' marker over mid-sentence heuristic separators", () => {
    const text =
      "Picked A as the default. Rationale: it is simpler and easier to support.";
    const parsed = parseDecision(text);
    // Prior behavior: " as " would fire first, cutting summary to "Picked A".
    // With the fix, we prefer the explicit marker.
    expect(parsed.summary).toBe("Picked A as the default.");
    expect(parsed.rationale).toBe("it is simpler and easier to support.");
  });

  it("prefers 'Why:' marker", () => {
    const text = "Chose X. Why: Y is faster.";
    const parsed = parseDecision(text);
    expect(parsed.summary).toBe("Chose X.");
    expect(parsed.rationale).toBe("Y is faster.");
  });

  it("prefers 'Reason:' marker", () => {
    const text = "Did the thing. Reason: it was necessary.";
    const parsed = parseDecision(text);
    expect(parsed.summary).toBe("Did the thing.");
    expect(parsed.rationale).toBe("it was necessary.");
  });
});

describe("parseDecision — numbered-list and labelled alternatives (bug fix)", () => {
  it("detects all items in a 'Rejected alternatives: (1) ... (2) ... (3) ...' list", () => {
    const text =
      "Macro-loop framing. Rationale: no existing benchmark covers it. " +
      "Rejected alternatives: (1) Exploration-efficiency ROI as primary wedge, " +
      "(2) Shared-markdown-hurts-in-conflict as headline, " +
      "(3) Minimal coordination budget / lite-matches-full as headline, " +
      "(4) Agent Teams as primary condition.";
    const parsed = parseDecision(text);
    expect(parsed.rejected_alternatives.length).toBe(4);
    expect(parsed.rejected_alternatives[0]).toContain("Exploration-efficiency ROI");
    expect(parsed.rejected_alternatives[1]).toContain("Shared-markdown-hurts-in-conflict");
    expect(parsed.rejected_alternatives[2]).toContain("Minimal coordination budget");
    expect(parsed.rejected_alternatives[3]).toContain("Agent Teams as primary condition");
  });

  it("detects all items with 'Alternative rejected:' prefix phrasings", () => {
    const text =
      "Use X. Because Y. " +
      "Alternative rejected: option A — too slow. " +
      "Alternative rejected: option B — breaks contract. " +
      "Alternative rejected: option C — unsupported. " +
      "Alternative rejected: option D — expensive.";
    const parsed = parseDecision(text);
    expect(parsed.rejected_alternatives.length).toBe(4);
    expect(parsed.rejected_alternatives[0]).toContain("option A");
    expect(parsed.rejected_alternatives[3]).toContain("option D");
  });

  it("does not duplicate alternatives when multiple patterns would match the same item", () => {
    // "Chose X over Y" — only one alternative, not repeated across 'over' + 'instead of'.
    const parsed = parseDecision("Chose X over Y because Z");
    expect(parsed.rejected_alternatives.length).toBe(1);
    expect(parsed.rejected_alternatives[0]).toContain("Y");
  });
});
