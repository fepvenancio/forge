import { describe, it, expect } from "vitest";
import { loadPrompt, getPromptPath, type PromptRole } from "./loader.js";
import { existsSync } from "node:fs";

const ALL_ROLES: PromptRole[] = [
  "planner",
  "worker",
  "sub-judge",
  "high-court",
  "librarian",
  "cost-auditor",
];

describe("Prompt Loader", () => {
  for (const role of ALL_ROLES) {
    describe(role, () => {
      it("file exists on disk", () => {
        const path = getPromptPath(role);
        expect(existsSync(path)).toBe(true);
      });

      it("loads non-empty content", () => {
        const content = loadPrompt(role);
        expect(content.length).toBeGreaterThan(100);
      });

      it("starts with role header", () => {
        const content = loadPrompt(role);
        expect(content).toMatch(/^# Role:/);
      });

      it("contains constraints section", () => {
        const content = loadPrompt(role);
        // All prompts except cost-auditor have explicit constraints
        if (role !== "cost-auditor") {
          expect(content).toContain("constraint");
        }
      });

      it("contains output section", () => {
        const content = loadPrompt(role);
        expect(content.toLowerCase()).toContain("output");
      });
    });
  }

  it("throws for invalid role", () => {
    expect(() => loadPrompt("nonexistent" as PromptRole)).toThrow(
      /Prompt file not found/,
    );
  });
});
