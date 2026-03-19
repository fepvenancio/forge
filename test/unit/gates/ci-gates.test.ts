import { describe, it } from "vitest";

describe("CI gate scripts", () => {
  describe("touch_map_conflicts gate", () => {
    it.todo("exits 0 when no conflicts detected");
    it.todo("exits 1 when conflicts found and outputs conflict details");
    it.todo("gracefully skips when Dolt is unavailable");
  });

  describe("config_validation gate", () => {
    it.todo("exits 0 when config.json is valid");
    it.todo("exits 1 when config.json has invalid branching_strategy");
    it.todo("exits 1 when config.json is missing required fields");
  });

  describe("cost_audit gate", () => {
    it.todo("exits 0 with warning when no cost data exists");
    it.todo("exits 0 when costs are within budget");
    it.todo("gracefully skips when Dolt is unavailable");
  });

  describe("flow_freshness criticality", () => {
    it.todo("uses criticality level for freshness threshold");
    it.todo("applies shorter threshold for critical flows than low flows");
  });

  describe("PR comment formatting", () => {
    it.todo("formats gate results as markdown table");
    it.todo("includes forge-gates-report marker comment for update-or-create pattern");
  });
});
