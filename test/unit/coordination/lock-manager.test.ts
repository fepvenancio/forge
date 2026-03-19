import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  lockFile: vi.fn(),
  unlockFile: vi.fn(),
  getAllFileLocks: vi.fn(),
  getFileLocksForPhase: vi.fn(),
  getDeveloper: vi.fn(),
  getPhaseAssignment: vi.fn(),
}));

import { acquireLock, releaseLock, listLocks } from "../../../packages/orchestrator/src/coordination/lock-manager.js";
import * as queries from "../../../packages/orchestrator/src/dolt/queries.js";

const mockedQueries = vi.mocked(queries);

describe("lock-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("acquireLock", () => {
    it("LOCK-01: locks a file for a developer and phase", async () => {
      mockedQueries.getDeveloper.mockResolvedValue({
        id: "alice",
        display_name: "Alice",
        registered_at: Date.now(),
        last_active: Date.now(),
        current_phase: 1,
        current_branch: "gsd/phase-1-foundation",
      });
      mockedQueries.getPhaseAssignment.mockResolvedValue({
        phase_id: 1,
        assignee: "alice",
        assigned_at: Date.now(),
        status: "in_progress",
        branch_name: "gsd/phase-1-foundation",
        pr_number: null,
      });
      mockedQueries.getAllFileLocks.mockResolvedValue([]);
      mockedQueries.lockFile.mockResolvedValue({
        file_path: "src/auth.ts",
        locked_by: "alice",
        phase_id: 1,
        locked_at: Date.now(),
        reason: null,
      });

      const result = await acquireLock({
        filePath: "src/auth.ts",
        developerId: "alice",
        phaseId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock!.file_path).toBe("src/auth.ts");
      expect(result.warning).toBeNull();
    });

    it("LOCK-01: requires valid developer and active phase assignment", async () => {
      mockedQueries.getDeveloper.mockResolvedValue(null);

      const result = await acquireLock({
        filePath: "src/auth.ts",
        developerId: "unknown",
        phaseId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.warning).toContain("not registered");
    });

    it("LOCK-01: warns but does not throw when file already locked by another developer", async () => {
      mockedQueries.getDeveloper.mockResolvedValue({
        id: "bob",
        display_name: "Bob",
        registered_at: Date.now(),
        last_active: Date.now(),
        current_phase: 2,
        current_branch: "gsd/phase-2-api",
      });
      mockedQueries.getPhaseAssignment.mockResolvedValue({
        phase_id: 2,
        assignee: "bob",
        assigned_at: Date.now(),
        status: "in_progress",
        branch_name: "gsd/phase-2-api",
        pr_number: null,
      });
      mockedQueries.getAllFileLocks.mockResolvedValue([{
        file_path: "src/auth.ts",
        locked_by: "alice",
        phase_id: 1,
        locked_at: Date.now(),
        reason: null,
      }]);
      mockedQueries.lockFile.mockResolvedValue({
        file_path: "src/auth.ts",
        locked_by: "bob",
        phase_id: 2,
        locked_at: Date.now(),
        reason: null,
      });

      const result = await acquireLock({
        filePath: "src/auth.ts",
        developerId: "bob",
        phaseId: 2,
      });

      expect(result.success).toBe(true);
      expect(result.warning).toContain("previously locked");
      expect(result.warning).toContain("alice");
    });
  });

  describe("releaseLock", () => {
    it("LOCK-02: unlocks a file locked by the requesting developer", async () => {
      mockedQueries.unlockFile.mockResolvedValue(undefined);

      await expect(releaseLock("src/auth.ts", "alice")).resolves.toBeUndefined();
      expect(mockedQueries.unlockFile).toHaveBeenCalledWith("src/auth.ts", "alice");
    });

    it("LOCK-02: throws error when file is not locked by the requesting developer", async () => {
      mockedQueries.unlockFile.mockRejectedValue(new Error('File "src/auth.ts" is locked by "alice", not by you ("bob")'));

      await expect(releaseLock("src/auth.ts", "bob")).rejects.toThrow("locked by");
    });
  });

  describe("listLocks", () => {
    it("LOCK-03: returns all active file locks with owner, phase, and timestamp", async () => {
      const locks = [{
        file_path: "src/auth.ts",
        locked_by: "alice",
        phase_id: 1,
        locked_at: Date.now(),
        reason: "working on auth",
      }];
      mockedQueries.getAllFileLocks.mockResolvedValue(locks);

      const result = await listLocks();

      expect(result).toEqual(locks);
    });

    it("LOCK-03: returns empty array when no locks exist", async () => {
      mockedQueries.getAllFileLocks.mockResolvedValue([]);

      const result = await listLocks();

      expect(result).toEqual([]);
    });
  });

  describe("advisory behavior", () => {
    it("LOCK-04: lock operations never throw blocking errors - always advisory", async () => {
      mockedQueries.getDeveloper.mockResolvedValue({
        id: "alice",
        display_name: "Alice",
        registered_at: Date.now(),
        last_active: Date.now(),
        current_phase: 1,
        current_branch: "gsd/phase-1-foundation",
      });
      mockedQueries.getPhaseAssignment.mockResolvedValue(null);

      const result = await acquireLock({
        filePath: "src/auth.ts",
        developerId: "alice",
        phaseId: 99,
      });

      // Returns failure result, does NOT throw
      expect(result.success).toBe(false);
      expect(result.warning).toBeDefined();
    });
  });
});
