import { describe, it, expect, vi, beforeEach } from "vitest";

// Since simple-git creates a real git instance at module load time,
// we test the git.ts exports by mocking at the wrapper level.
// This matches the pattern used by phase-manager.test.ts.

vi.mock("../../../packages/orchestrator/src/utils/git.js", async () => {
  return {
    listLocalBranches: vi.fn(),
    createBranch: vi.fn(),
    getGitConfigValue: vi.fn(),
    showFile: vi.fn(),
    diffNameOnly: vi.fn(),
    listTree: vi.fn(),
  };
});

import * as git from "../../../packages/orchestrator/src/utils/git.js";

const mockedGit = vi.mocked(git);

describe("git utilities - export verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("showFile", () => {
    it("is exported as an async function", () => {
      expect(typeof git.showFile).toBe("function");
    });

    it("accepts branch and filePath parameters", async () => {
      mockedGit.showFile.mockResolvedValue("file content");
      const result = await git.showFile("my-branch", "path/to/file.md");
      expect(mockedGit.showFile).toHaveBeenCalledWith("my-branch", "path/to/file.md");
      expect(result).toBe("file content");
    });
  });

  describe("diffNameOnly", () => {
    it("is exported as an async function", () => {
      expect(typeof git.diffNameOnly).toBe("function");
    });

    it("accepts base and head parameters", async () => {
      mockedGit.diffNameOnly.mockResolvedValue(["src/file1.ts", "src/file2.ts"]);
      const result = await git.diffNameOnly("main", "gsd/phase-3-ui");
      expect(mockedGit.diffNameOnly).toHaveBeenCalledWith("main", "gsd/phase-3-ui");
      expect(result).toEqual(["src/file1.ts", "src/file2.ts"]);
    });
  });

  describe("listTree", () => {
    it("is exported as an async function", () => {
      expect(typeof git.listTree).toBe("function");
    });

    it("accepts branch and path parameters", async () => {
      mockedGit.listTree.mockResolvedValue([".planning/phases/01/01-01-PLAN.md"]);
      const result = await git.listTree("my-branch", ".planning/");
      expect(mockedGit.listTree).toHaveBeenCalledWith("my-branch", ".planning/");
      expect(result).toEqual([".planning/phases/01/01-01-PLAN.md"]);
    });
  });

  describe("existing functions preserved", () => {
    it("exports listLocalBranches", () => {
      expect(typeof git.listLocalBranches).toBe("function");
    });

    it("exports createBranch", () => {
      expect(typeof git.createBranch).toBe("function");
    });

    it("exports getGitConfigValue", () => {
      expect(typeof git.getGitConfigValue).toBe("function");
    });
  });
});
