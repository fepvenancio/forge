import { describe, it, vi } from "vitest";

vi.mock("../../../packages/orchestrator/src/coordination/conflict-detector.js", () => ({
  checkConflicts: vi.fn(),
}));

vi.mock("../../../packages/orchestrator/src/coordination/lock-manager.js", () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  listLocks: vi.fn(),
}));

describe("conflicts CLI commands", () => {
  describe("check-conflicts command", () => {
    it.todo("displays conflict table when overlaps exist");
    it.todo("displays 'no conflicts' message when clean");
    it.todo("shows declared vs actual file source in output");
  });

  describe("lock command", () => {
    it.todo("locks a file with --phase option");
    it.todo("shows error when no phase specified and no current phase");
  });

  describe("unlock command", () => {
    it.todo("unlocks a file owned by current developer");
  });

  describe("locks command", () => {
    it.todo("displays all active locks in a table");
    it.todo("displays 'no locks' message when none exist");
  });
});
