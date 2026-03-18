import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countLOC, countFlows } from "./selector.js";

describe("countLOC", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "forge-loc-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("counts lines in source files", () => {
    writeFileSync(join(tempDir, "index.ts"), "line1\nline2\nline3\n");
    writeFileSync(join(tempDir, "app.ts"), "a\nb\n");
    const loc = countLOC(tempDir);
    // 4 lines in index.ts (3 lines + trailing), 3 in app.ts (2 + trailing)
    expect(loc).toBeGreaterThanOrEqual(5);
  });

  it("excludes node_modules", () => {
    mkdirSync(join(tempDir, "node_modules"), { recursive: true });
    writeFileSync(join(tempDir, "node_modules", "big.js"), "x\n".repeat(100000));
    writeFileSync(join(tempDir, "src.ts"), "hello\n");
    const loc = countLOC(tempDir);
    expect(loc).toBeLessThan(100);
  });

  it("excludes binary extensions", () => {
    writeFileSync(join(tempDir, "image.png"), "binary data");
    writeFileSync(join(tempDir, "src.ts"), "hello\n");
    const loc = countLOC(tempDir);
    expect(loc).toBeLessThan(10);
  });
});

describe("countFlows", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "forge-flows-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("counts flow files in .flows directory", () => {
    mkdirSync(join(tempDir, ".flows"));
    writeFileSync(join(tempDir, ".flows", "auth.md"), "# Auth Flow");
    writeFileSync(join(tempDir, ".flows", "payment.md"), "# Payment Flow");
    expect(countFlows(tempDir)).toBe(2);
  });

  it("returns 0 when no .flows directory", () => {
    expect(countFlows(tempDir)).toBe(0);
  });
});
