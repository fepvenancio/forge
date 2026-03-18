import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeDependencyChecksums,
  checkDependencyDrift,
} from "../../packages/orchestrator/src/worktree/manager.js";

describe("Dependency Drift Detection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "forge-drift-"));
    writeFileSync(join(tempDir, "package.json"), '{"name": "test", "version": "1.0.0"}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects when package.json is modified", () => {
    const before = computeDependencyChecksums(tempDir);
    writeFileSync(
      join(tempDir, "package.json"),
      '{"name": "test", "version": "1.0.0", "dependencies": {"express": "^5.0.0"}}',
    );
    const after = computeDependencyChecksums(tempDir);
    const drift = checkDependencyDrift(before, after);
    expect(drift).toContain("package.json");
  });

  it("detects when a new dependency file appears", () => {
    const before = computeDependencyChecksums(tempDir);
    writeFileSync(join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: 9.0");
    const after = computeDependencyChecksums(tempDir);
    const drift = checkDependencyDrift(before, after);
    expect(drift).toContain("pnpm-lock.yaml");
  });

  it("reports no drift when files are unchanged", () => {
    const before = computeDependencyChecksums(tempDir);
    const after = computeDependencyChecksums(tempDir);
    const drift = checkDependencyDrift(before, after);
    expect(drift).toHaveLength(0);
  });

  it("handles missing dependency files gracefully", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "forge-empty-"));
    const checksums = computeDependencyChecksums(emptyDir);
    // All should be null
    expect(checksums["package.json"]).toBeNull();
    expect(checksums["go.sum"]).toBeNull();
    rmSync(emptyDir, { recursive: true, force: true });
  });
});
