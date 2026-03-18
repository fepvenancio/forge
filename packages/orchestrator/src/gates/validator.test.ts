import { describe, it, expect } from "vitest";
import { validate, validateOrThrow, getAvailableSchemas } from "./validator.js";

describe("Schema Validator", () => {
  it("lists all available schemas", () => {
    const schemas = getAvailableSchemas();
    expect(schemas).toContain("plan");
    expect(schemas).toContain("touch-map");
    expect(schemas).toContain("sub-judge-report");
    expect(schemas).toContain("property-test-report");
    expect(schemas).toContain("security-report");
    expect(schemas).toContain("high-court-report");
    expect(schemas).toContain("cycle-cost-report");
    expect(schemas.length).toBe(7);
  });

  describe("plan schema", () => {
    it("accepts valid plan", () => {
      const plan = {
        task_id: "t-001",
        cycle_id: "c-001",
        title: "Add user endpoint",
        reasoning: "Need CRUD operations for users",
        tasks: [
          {
            id: "sub-001",
            title: "Create user model",
            layer: "backend",
            complexity: "standard",
            touch_map: {
              reads: ["src/models/index.ts"],
              writes: ["src/models/user.ts"],
            },
            acceptance_criteria: ["User model exists with name and email fields"],
            must_not_change: ["src/models/index.ts"],
          },
        ],
      };
      const result = validate("plan", plan);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects plan missing required fields", () => {
      const result = validate("plan", { task_id: "t-001" });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects plan with invalid layer", () => {
      const plan = {
        task_id: "t-001",
        cycle_id: "c-001",
        title: "Test",
        reasoning: "Test",
        tasks: [
          {
            id: "sub-001",
            title: "Test task",
            layer: "invalid_layer",
            complexity: "standard",
            touch_map: { reads: [], writes: [] },
            acceptance_criteria: ["test"],
            must_not_change: [],
          },
        ],
      };
      const result = validate("plan", plan);
      expect(result.valid).toBe(false);
    });
  });

  describe("touch-map schema", () => {
    it("accepts valid touch map", () => {
      const result = validate("touch-map", {
        task_id: "t-001",
        reads: ["src/index.ts"],
        writes: ["src/new-file.ts"],
      });
      expect(result.valid).toBe(true);
    });

    it("rejects touch map missing task_id", () => {
      const result = validate("touch-map", {
        reads: ["src/index.ts"],
        writes: [],
      });
      expect(result.valid).toBe(false);
    });

    it("rejects touch map with non-array writes", () => {
      const result = validate("touch-map", {
        task_id: "t-001",
        reads: [],
        writes: "not-an-array",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("sub-judge-report schema", () => {
    it("accepts valid report", () => {
      const result = validate("sub-judge-report", {
        task_id: "t-001",
        stage_run_id: "sr-001",
        status: "pass",
        checks: [
          { name: "syntax", result: "pass" },
          { name: "linting", result: "pass" },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it("rejects report with invalid status", () => {
      const result = validate("sub-judge-report", {
        task_id: "t-001",
        stage_run_id: "sr-001",
        status: "invalid",
        checks: [],
      });
      expect(result.valid).toBe(false);
    });

    it("rejects report missing checks", () => {
      const result = validate("sub-judge-report", {
        task_id: "t-001",
        stage_run_id: "sr-001",
        status: "pass",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("property-test-report schema", () => {
    it("accepts valid report", () => {
      const result = validate("property-test-report", {
        task_id: "t-001",
        runner: "fast-check",
        status: "pass",
        tests: [{ name: "commutative addition", result: "pass", iterations: 100 }],
      });
      expect(result.valid).toBe(true);
    });

    it("rejects report missing runner", () => {
      const result = validate("property-test-report", {
        task_id: "t-001",
        status: "pass",
        tests: [],
      });
      expect(result.valid).toBe(false);
    });

    it("rejects report with invalid test result", () => {
      const result = validate("property-test-report", {
        task_id: "t-001",
        runner: "fast-check",
        status: "pass",
        tests: [{ name: "test", result: "invalid_result" }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("security-report schema", () => {
    it("accepts valid report", () => {
      const result = validate("security-report", {
        task_id: "t-001",
        status: "pass",
        checks: [
          { name: "no-hardcoded-secrets", result: "pass" },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it("rejects report with invalid severity", () => {
      const result = validate("security-report", {
        task_id: "t-001",
        status: "fail",
        checks: [
          { name: "sql-injection", result: "fail", severity: "catastrophic" },
        ],
      });
      expect(result.valid).toBe(false);
    });

    it("rejects report missing status", () => {
      const result = validate("security-report", {
        task_id: "t-001",
        checks: [],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("high-court-report schema", () => {
    it("accepts valid report", () => {
      const result = validate("high-court-report", {
        cycle_id: "c-001",
        decision: "merge",
        workers_reviewed: ["t-001", "t-002"],
        merge_order: ["t-001", "t-002"],
        invariant_checks: [
          { invariant: "No circular dependencies", result: "pass" },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it("rejects report with invalid decision", () => {
      const result = validate("high-court-report", {
        cycle_id: "c-001",
        decision: "revise",
        workers_reviewed: ["t-001"],
      });
      expect(result.valid).toBe(false);
    });

    it("rejects report missing workers_reviewed", () => {
      const result = validate("high-court-report", {
        cycle_id: "c-001",
        decision: "merge",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("cycle-cost-report schema", () => {
    it("accepts valid report", () => {
      const result = validate("cycle-cost-report", {
        cycle_id: "c-001",
        total_cost_usd: 12.50,
        exceeds_cap: false,
        cap_usd: 50,
        breakdown: [
          {
            stage: "planner",
            model: "claude-opus-4-6",
            input_tokens: 50000,
            output_tokens: 2000,
            cost_usd: 0.90,
          },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it("rejects report missing breakdown", () => {
      const result = validate("cycle-cost-report", {
        cycle_id: "c-001",
        total_cost_usd: 12.50,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects report with non-numeric cost", () => {
      const result = validate("cycle-cost-report", {
        cycle_id: "c-001",
        total_cost_usd: "expensive",
        breakdown: [],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("validateOrThrow", () => {
    it("returns data when valid", () => {
      const data = {
        task_id: "t-001",
        reads: ["src/index.ts"],
        writes: [],
      };
      const result = validateOrThrow("touch-map", data);
      expect(result).toEqual(data);
    });

    it("throws with field-level errors when invalid", () => {
      expect(() => validateOrThrow("touch-map", {})).toThrow(
        /Schema validation failed/,
      );
    });
  });
});
