import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { escalateConflicts } from "../../../packages/orchestrator/src/coordination/escalation.js";
import type { EscalationPayload } from "../../../packages/orchestrator/src/coordination/escalation.js";
import type { ConflictReport, FileConflict } from "../../../packages/orchestrator/src/coordination/conflict-detector.js";
import type { PhaseAssignment, Developer } from "../../../packages/orchestrator/src/dolt/schema.js";

describe("escalation", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.FORGE_ESCALATION_WEBHOOK_URL;
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.FORGE_ESCALATION_WEBHOOK_URL;
    } else {
      process.env.FORGE_ESCALATION_WEBHOOK_URL = originalEnv;
    }
  });

  const makeReport = (conflicts: FileConflict[]): ConflictReport => ({
    conflicts,
    lockWarnings: [],
    declaredOnlyFiles: new Map(),
    actualOnlyFiles: new Map(),
    timestamp: Date.now(),
  });

  const assignments: PhaseAssignment[] = [
    { phase_id: 1, assignee: "alice", assigned_at: 0, status: "pr_open", branch_name: "gsd/phase-1", pr_number: 10 },
    { phase_id: 2, assignee: "bob", assigned_at: 0, status: "pr_open", branch_name: "gsd/phase-2", pr_number: 11 },
  ];

  const developers: Developer[] = [
    { id: "alice", display_name: "Alice Smith", registered_at: 0, last_active: 0, current_phase: 1, current_branch: "gsd/phase-1" },
    { id: "bob", display_name: "Bob Jones", registered_at: 0, last_active: 0, current_phase: 2, current_branch: "gsd/phase-2" },
  ];

  describe("escalateConflicts", () => {
    it("returns false when FORGE_ESCALATION_WEBHOOK_URL is not set", async () => {
      delete process.env.FORGE_ESCALATION_WEBHOOK_URL;
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch as any;

      const report = makeReport([
        { filePath: "src/shared.ts", phases: [{ phaseId: 1, branch: "gsd/phase-1", source: "declared" }, { phaseId: 2, branch: "gsd/phase-2", source: "actual" }] },
      ]);

      const result = await escalateConflicts(report, assignments, developers);
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends POST to webhook URL with conflict details", async () => {
      process.env.FORGE_ESCALATION_WEBHOOK_URL = "https://hooks.example.com/test";
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch as any;

      const report = makeReport([
        { filePath: "src/shared.ts", phases: [{ phaseId: 1, branch: "gsd/phase-1", source: "declared" }, { phaseId: 2, branch: "gsd/phase-2", source: "actual" }] },
      ]);

      await escalateConflicts(report, assignments, developers);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://hooks.example.com/test");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/json");
    });

    it("includes file paths, phase IDs, and developer names in payload", async () => {
      process.env.FORGE_ESCALATION_WEBHOOK_URL = "https://hooks.example.com/test";
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch as any;

      const report = makeReport([
        { filePath: "src/auth.ts", phases: [{ phaseId: 1, branch: "gsd/phase-1", source: "declared" }, { phaseId: 2, branch: "gsd/phase-2", source: "actual" }] },
      ]);

      await escalateConflicts(report, assignments, developers);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("src/auth.ts");
      expect(body.text).toContain("Phase 1");
      expect(body.text).toContain("Phase 2");
      expect(body.text).toContain("Alice Smith");
      expect(body.text).toContain("Bob Jones");
    });

    it("returns true on successful webhook response", async () => {
      process.env.FORGE_ESCALATION_WEBHOOK_URL = "https://hooks.example.com/test";
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch as any;

      const report = makeReport([
        { filePath: "src/shared.ts", phases: [{ phaseId: 1, branch: "gsd/phase-1", source: "declared" }] },
      ]);

      const result = await escalateConflicts(report, assignments, developers);
      expect(result).toBe(true);
    });

    it("returns false and logs error on fetch failure", async () => {
      process.env.FORGE_ESCALATION_WEBHOOK_URL = "https://hooks.example.com/test";
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      globalThis.fetch = mockFetch as any;
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const report = makeReport([
        { filePath: "src/shared.ts", phases: [{ phaseId: 1, branch: "gsd/phase-1", source: "declared" }] },
      ]);

      const result = await escalateConflicts(report, assignments, developers);
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });

    it("formats message with all conflicting files and phases", async () => {
      process.env.FORGE_ESCALATION_WEBHOOK_URL = "https://hooks.example.com/test";
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch as any;

      const report = makeReport([
        { filePath: "src/a.ts", phases: [{ phaseId: 1, branch: "gsd/phase-1", source: "declared" }, { phaseId: 2, branch: "gsd/phase-2", source: "actual" }] },
        { filePath: "src/b.ts", phases: [{ phaseId: 1, branch: "gsd/phase-1", source: "declared" }, { phaseId: 2, branch: "gsd/phase-2", source: "declared" }] },
      ]);

      await escalateConflicts(report, assignments, developers);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("src/a.ts");
      expect(body.text).toContain("src/b.ts");
    });
  });
});
