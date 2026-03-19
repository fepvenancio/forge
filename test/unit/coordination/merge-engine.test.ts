import { describe, it } from "vitest";

describe("merge-engine", () => {
  describe("computeMergeOrder", () => {
    it.todo("returns empty order for empty input");
    it.todo("returns single phase when only one phase exists");
    it.todo("orders phases by declared dependencies (ROADMAP dependsOn)");
    it.todo("adds inferred edges from touch map overlaps (lower phase first)");
    it.todo("detects circular dependencies and returns them in cycles array");
    it.todo("handles dependency chains (A -> B -> C)");
    it.todo("includes reasoning strings explaining ordering decisions");
    it.todo("filters to only phases with open PRs when prNumber is set");
  });
});
