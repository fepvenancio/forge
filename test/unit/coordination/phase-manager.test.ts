import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock git utility and dolt queries
vi.mock("../../../packages/orchestrator/src/utils/git.js", () => ({
  listLocalBranches: vi.fn().mockResolvedValue([]),
  createBranch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../packages/orchestrator/src/dolt/queries.js", () => ({
  getDeveloper: vi.fn(),
  claimPhase: vi.fn(),
  releasePhase: vi.fn(),
}));

import {
  validateBranchName,
  generateBranchName,
  claimPhaseWithBranch,
  assignPhaseTodev,
  releasePhaseAssignment,
  BRANCH_PATTERN,
} from "../../../packages/orchestrator/src/coordination/phase-manager.js";

import * as queries from "../../../packages/orchestrator/src/dolt/queries.js";
import * as git from "../../../packages/orchestrator/src/utils/git.js";

const mockedQueries = vi.mocked(queries);
const mockedGit = vi.mocked(git);

describe("phase-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGit.listLocalBranches.mockResolvedValue([]);
    mockedGit.createBranch.mockResolvedValue(undefined);
  });

  describe("BRANCH_PATTERN", () => {
    it("matches valid branch names", () => {
      expect(BRANCH_PATTERN.test("gsd/phase-1-foundation")).toBe(true);
      expect(BRANCH_PATTERN.test("gsd/phase-12-some-slug")).toBe(true);
      expect(BRANCH_PATTERN.test("gsd/phase-3-ci-cd-pipeline")).toBe(true);
    });

    it("rejects invalid branch names", () => {
      expect(BRANCH_PATTERN.test("feature/my-branch")).toBe(false);
      expect(BRANCH_PATTERN.test("gsd/phase-1-UPPERCASE")).toBe(false);
      expect(BRANCH_PATTERN.test("gsd/phase--slug")).toBe(false);
      expect(BRANCH_PATTERN.test("main")).toBe(false);
    });
  });

  describe("validateBranchName", () => {
    it("returns true for valid gsd/phase-N-slug pattern", () => {
      expect(validateBranchName("gsd/phase-1-foundation")).toBe(true);
    });

    it("returns true for multi-digit phase numbers", () => {
      expect(validateBranchName("gsd/phase-12-some-slug")).toBe(true);
    });

    it("returns false for non-gsd branches", () => {
      expect(validateBranchName("feature/my-branch")).toBe(false);
    });

    it("returns false for uppercase slugs", () => {
      expect(validateBranchName("gsd/phase-1-UPPERCASE")).toBe(false);
    });
  });

  describe("generateBranchName", () => {
    it("generates slug from phase name", () => {
      expect(generateBranchName(1, "Foundation and Setup")).toBe(
        "gsd/phase-1-foundation-and-setup",
      );
    });

    it("handles special characters like slashes", () => {
      expect(generateBranchName(3, "CI/CD Pipeline")).toBe(
        "gsd/phase-3-cicd-pipeline",
      );
    });

    it("collapses multiple hyphens", () => {
      expect(generateBranchName(2, "some  spaced   name")).toBe(
        "gsd/phase-2-some-spaced-name",
      );
    });
  });

  describe("claimPhaseWithBranch", () => {
    it("calls queries.claimPhase and creates git branch", async () => {
      const mockAssignment = {
        phase_id: 1,
        assignee: "dev1",
        assigned_at: Date.now(),
        status: "assigned" as const,
        branch_name: "gsd/phase-1-foundation",
        pr_number: null,
      };
      mockedQueries.claimPhase.mockResolvedValue(mockAssignment);

      const result = await claimPhaseWithBranch({
        phaseId: 1,
        assignee: "dev1",
        phaseName: "Foundation",
      });

      expect(mockedGit.createBranch).toHaveBeenCalledWith(
        "gsd/phase-1-foundation",
      );
      expect(mockedQueries.claimPhase).toHaveBeenCalledWith({
        phase_id: 1,
        assignee: "dev1",
        branch_name: "gsd/phase-1-foundation",
      });
      expect(result).toEqual(mockAssignment);
    });

    it("checks if branch exists before creating", async () => {
      mockedGit.listLocalBranches.mockResolvedValue([
        "gsd/phase-1-foundation",
      ]);
      mockedQueries.claimPhase.mockResolvedValue({
        phase_id: 1,
        assignee: "dev1",
        assigned_at: Date.now(),
        status: "assigned" as const,
        branch_name: "gsd/phase-1-foundation",
        pr_number: null,
      });

      await claimPhaseWithBranch({
        phaseId: 1,
        assignee: "dev1",
        phaseName: "Foundation",
      });

      // Should NOT create branch since it already exists
      expect(mockedGit.createBranch).not.toHaveBeenCalled();
    });

    it("rejects invalid branch names", async () => {
      await expect(
        claimPhaseWithBranch({
          phaseId: 1,
          assignee: "dev1",
          phaseName: "Foundation",
          branchName: "invalid-branch-name",
        }),
      ).rejects.toThrow("Invalid branch name");
    });
  });

  describe("assignPhaseTodev", () => {
    it("verifies developer exists then calls claimPhaseWithBranch", async () => {
      mockedQueries.getDeveloper.mockResolvedValue({
        id: "dev1",
        display_name: "Dev One",
        registered_at: Date.now(),
        last_active: Date.now(),
        current_phase: null,
        current_branch: null,
      });
      mockedQueries.claimPhase.mockResolvedValue({
        phase_id: 2,
        assignee: "dev1",
        assigned_at: Date.now(),
        status: "assigned" as const,
        branch_name: "gsd/phase-2-core-api",
        pr_number: null,
      });

      const result = await assignPhaseTodev({
        phaseId: 2,
        developerId: "dev1",
        phaseName: "Core API",
      });

      expect(mockedQueries.getDeveloper).toHaveBeenCalledWith("dev1");
      expect(result.phase_id).toBe(2);
    });

    it("throws if developer not registered", async () => {
      mockedQueries.getDeveloper.mockResolvedValue(null);

      await expect(
        assignPhaseTodev({
          phaseId: 2,
          developerId: "unknown",
          phaseName: "Core API",
        }),
      ).rejects.toThrow('Developer "unknown" not registered');
    });
  });

  describe("releasePhaseAssignment", () => {
    it("delegates to queries.releasePhase", async () => {
      mockedQueries.releasePhase.mockResolvedValue(undefined);

      await releasePhaseAssignment(3);

      expect(mockedQueries.releasePhase).toHaveBeenCalledWith(3);
    });
  });
});
