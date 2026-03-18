import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  createWorktree,
  destroyWorktree,
  listWorktrees,
  getWorktreePath,
  computeDependencyChecksums,
  checkDependencyDrift,
  checkWriteConflicts,
} from "./manager.js";
import { writeFileSync } from "node:fs";

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, { encoding: "utf8", cwd }).trim();
}

describe("Worktree Manager", () => {
  let tempRepo: string;

  beforeEach(() => {
    // Create a temp git repo
    tempRepo = mkdtempSync(join(tmpdir(), "forge-test-"));
    exec("git init", tempRepo);
    exec("git config user.email test@test.com", tempRepo);
    exec("git config user.name Test", tempRepo);
    writeFileSync(join(tempRepo, "README.md"), "# Test");
    writeFileSync(join(tempRepo, "package.json"), '{"name": "test"}');
    exec("git add -A", tempRepo);
    exec('git commit -m "init"', tempRepo);
  });

  afterEach(() => {
    // Clean up worktrees first
    try {
      exec("git worktree prune", tempRepo);
    } catch {}
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it("creates a worktree", () => {
    const info = createWorktree(tempRepo, "task-001");
    expect(info.taskId).toBe("task-001");
    expect(info.branch).toBe("forge/task/task-001");
    expect(info.path).toContain("task-001");
  });

  it("throws on duplicate worktree", () => {
    createWorktree(tempRepo, "task-002");
    expect(() => createWorktree(tempRepo, "task-002")).toThrow(
      /already exists/,
    );
  });

  it("lists worktrees", () => {
    createWorktree(tempRepo, "task-003");
    createWorktree(tempRepo, "task-004");
    const list = listWorktrees(tempRepo);
    expect(list.length).toBe(2);
    expect(list.map((w) => w.taskId)).toContain("task-003");
    expect(list.map((w) => w.taskId)).toContain("task-004");
  });

  it("destroys a worktree", () => {
    createWorktree(tempRepo, "task-005");
    destroyWorktree(tempRepo, "task-005");
    const list = listWorktrees(tempRepo);
    expect(list.find((w) => w.taskId === "task-005")).toBeUndefined();
  });

  it("gets worktree path", () => {
    const path = getWorktreePath(tempRepo, "task-006");
    expect(path).toContain(".forge/worktrees/task-006");
  });
});

describe("Dependency Checksums", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "forge-dep-"));
    writeFileSync(join(tempDir, "package.json"), '{"name": "test"}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("computes checksums", () => {
    const checksums = computeDependencyChecksums(tempDir);
    expect(checksums["package.json"]).toBeTruthy();
    expect(checksums["go.sum"]).toBeNull(); // doesn't exist
  });

  it("detects drift when file changes", () => {
    const before = computeDependencyChecksums(tempDir);
    writeFileSync(join(tempDir, "package.json"), '{"name": "changed"}');
    const after = computeDependencyChecksums(tempDir);
    const drift = checkDependencyDrift(before, after);
    expect(drift).toContain("package.json");
  });

  it("reports no drift when unchanged", () => {
    const before = computeDependencyChecksums(tempDir);
    const after = computeDependencyChecksums(tempDir);
    const drift = checkDependencyDrift(before, after);
    expect(drift).toHaveLength(0);
  });
});

describe("Touch Map Conflict Detection", () => {
  it("detects write conflicts", () => {
    const conflicts = checkWriteConflicts([
      { taskId: "t-001", writes: ["src/a.ts", "src/shared.ts"] },
      { taskId: "t-002", writes: ["src/b.ts", "src/shared.ts"] },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].file).toBe("src/shared.ts");
    expect(conflicts[0].tasks).toEqual(["t-001", "t-002"]);
  });

  it("reports no conflicts when writes are disjoint", () => {
    const conflicts = checkWriteConflicts([
      { taskId: "t-001", writes: ["src/a.ts"] },
      { taskId: "t-002", writes: ["src/b.ts"] },
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it("handles empty touch maps", () => {
    const conflicts = checkWriteConflicts([]);
    expect(conflicts).toHaveLength(0);
  });
});
