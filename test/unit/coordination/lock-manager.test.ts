import { describe, it, vi } from "vitest";

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  lockFile: vi.fn(),
  unlockFile: vi.fn(),
  getAllFileLocks: vi.fn(),
  getFileLocksForPhase: vi.fn(),
  getDeveloper: vi.fn(),
  getPhaseAssignment: vi.fn(),
}));

describe("lock-manager", () => {
  describe("acquireLock", () => {
    it.todo("LOCK-01: locks a file for a developer and phase");
    it.todo("LOCK-01: requires valid developer and active phase assignment");
    it.todo("LOCK-01: warns but does not throw when file already locked by another developer");
  });

  describe("releaseLock", () => {
    it.todo("LOCK-02: unlocks a file locked by the requesting developer");
    it.todo("LOCK-02: throws error when file is not locked by the requesting developer");
  });

  describe("listLocks", () => {
    it.todo("LOCK-03: returns all active file locks with owner, phase, and timestamp");
    it.todo("LOCK-03: returns empty array when no locks exist");
  });

  describe("advisory behavior", () => {
    it.todo("LOCK-04: lock operations never throw blocking errors - always advisory");
  });
});
