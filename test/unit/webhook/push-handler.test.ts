import { describe, it } from "vitest";

describe("push event handler", () => {
  it.todo("ignores push events for non-GSD branches");
  it.todo("extracts changed files from push payload commits");
  it.todo("marks matching flows as stale in Dolt");
  it.todo("handles push with no matching flow file refs");
  it.todo("returns success even when Dolt is unavailable");

  describe("merge order PR comment", () => {
    it.todo("posts merge order PR comment when multiple PRs are open");
    it.todo("uses <!-- forge-merge-order --> marker for update-or-create");
    it.todo("skips merge order comment when fewer than 2 PRs are open");
  });

  describe("escalation wiring", () => {
    it.todo("triggers escalateConflicts when conflict report has conflicts");
    it.todo("does not fail webhook response when escalation fails");
  });
});
