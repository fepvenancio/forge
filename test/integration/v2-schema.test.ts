/**
 * Integration tests for v2 Team Coordination schema.
 * Requires Dolt running on localhost:3306 with v2 tables created.
 *
 * Run: npx vitest run test/integration/v2-schema.test.ts
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as queries from "../../packages/orchestrator/src/dolt/queries.js";
import { query, execute, closePool } from "../../packages/orchestrator/src/dolt/client.js";
import type { RowDataPacket } from "mysql2";

let doltAvailable = false;

beforeAll(async () => {
  try {
    await query<RowDataPacket[]>("SELECT 1");
    // Verify v2 tables exist
    await query<RowDataPacket[]>("SELECT 1 FROM developers LIMIT 0");
    await query<RowDataPacket[]>("SELECT 1 FROM phase_assignments LIMIT 0");
    doltAvailable = true;
  } catch {
    doltAvailable = false;
  }
});

afterAll(async () => {
  await closePool();
});

describe.skipIf(!doltAvailable)("v2 Schema - Developers", () => {
  beforeEach(async () => {
    await execute("DELETE FROM phase_assignments");
    await execute("DELETE FROM developers");
  });

  it("registers a developer", async () => {
    const dev = await queries.registerDeveloper({
      id: "alice",
      display_name: "Alice",
    });
    expect(dev).toBeTruthy();
    expect(dev.id).toBe("alice");
    expect(dev.display_name).toBe("Alice");
    expect(dev.registered_at).toBeGreaterThan(0);
    expect(dev.last_active).toBeGreaterThan(0);
    expect(dev.current_phase).toBeNull();
    expect(dev.current_branch).toBeNull();
  });

  it("gets a developer by id", async () => {
    await queries.registerDeveloper({ id: "alice", display_name: "Alice" });
    const dev = await queries.getDeveloper("alice");
    expect(dev).toBeTruthy();
    expect(dev!.id).toBe("alice");
    expect(dev!.display_name).toBe("Alice");
  });

  it("returns null for non-existent developer", async () => {
    const dev = await queries.getDeveloper("nonexistent");
    expect(dev).toBeNull();
  });

  it("gets all developers", async () => {
    await queries.registerDeveloper({ id: "alice", display_name: "Alice" });
    await queries.registerDeveloper({ id: "bob", display_name: "Bob" });
    const devs = await queries.getAllDevelopers();
    expect(devs.length).toBe(2);
    expect(devs[0].id).toBe("alice");
    expect(devs[1].id).toBe("bob");
  });

  it("throws error on duplicate developer id", async () => {
    await queries.registerDeveloper({ id: "alice", display_name: "Alice" });
    await expect(
      queries.registerDeveloper({ id: "alice", display_name: "Alice 2" }),
    ).rejects.toThrow();
  });

  it("updates developer activity timestamp", async () => {
    const dev = await queries.registerDeveloper({ id: "alice", display_name: "Alice" });
    const originalLastActive = dev.last_active;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));

    await queries.updateDeveloperActivity("alice");
    const updated = await queries.getDeveloper("alice");
    expect(updated!.last_active).toBeGreaterThanOrEqual(originalLastActive);
  });
});

describe.skipIf(!doltAvailable)("v2 Schema - Phase Assignments", () => {
  beforeEach(async () => {
    await execute("DELETE FROM phase_assignments");
    await execute("DELETE FROM developers");
    // Register test developers
    await queries.registerDeveloper({ id: "alice", display_name: "Alice" });
    await queries.registerDeveloper({ id: "bob", display_name: "Bob" });
  });

  it("claims a phase", async () => {
    const assignment = await queries.claimPhase({
      phase_id: 1,
      assignee: "alice",
      branch_name: "gsd/phase-1-foundation",
    });
    expect(assignment.phase_id).toBe(1);
    expect(assignment.assignee).toBe("alice");
    expect(assignment.status).toBe("assigned");
    expect(assignment.branch_name).toBe("gsd/phase-1-foundation");
    expect(assignment.pr_number).toBeNull();
    expect(assignment.assigned_at).toBeGreaterThan(0);
  });

  it("updates developer current_phase on claim", async () => {
    await queries.claimPhase({
      phase_id: 1,
      assignee: "alice",
      branch_name: "gsd/phase-1-foundation",
    });
    const dev = await queries.getDeveloper("alice");
    expect(dev!.current_phase).toBe(1);
    expect(dev!.current_branch).toBe("gsd/phase-1-foundation");
  });

  it("throws error when phase already assigned", async () => {
    await queries.claimPhase({
      phase_id: 1,
      assignee: "alice",
      branch_name: "gsd/phase-1-foundation",
    });
    await expect(
      queries.claimPhase({
        phase_id: 1,
        assignee: "bob",
        branch_name: "gsd/phase-1-foundation",
      }),
    ).rejects.toThrow("Phase 1 is already assigned");
  });

  it("enforces 1:1:1 - developer cannot claim second phase", async () => {
    await queries.claimPhase({
      phase_id: 1,
      assignee: "alice",
      branch_name: "gsd/phase-1-foundation",
    });
    await expect(
      queries.claimPhase({
        phase_id: 2,
        assignee: "alice",
        branch_name: "gsd/phase-2-core",
      }),
    ).rejects.toThrow("Developer alice already has an active phase assignment");
  });

  it("releases a phase", async () => {
    await queries.claimPhase({
      phase_id: 1,
      assignee: "alice",
      branch_name: "gsd/phase-1-foundation",
    });
    await queries.releasePhase(1);

    const assignment = await queries.getPhaseAssignment(1);
    expect(assignment).toBeNull();

    const dev = await queries.getDeveloper("alice");
    expect(dev!.current_phase).toBeNull();
    expect(dev!.current_branch).toBeNull();
  });

  it("gets all phase assignments", async () => {
    await queries.claimPhase({
      phase_id: 1,
      assignee: "alice",
      branch_name: "gsd/phase-1-foundation",
    });
    await queries.claimPhase({
      phase_id: 2,
      assignee: "bob",
      branch_name: "gsd/phase-2-core",
    });
    const assignments = await queries.getAllPhaseAssignments();
    expect(assignments.length).toBe(2);
    expect(assignments[0].phase_id).toBe(1);
    expect(assignments[1].phase_id).toBe(2);
  });

  it("updates phase status", async () => {
    await queries.claimPhase({
      phase_id: 1,
      assignee: "alice",
      branch_name: "gsd/phase-1-foundation",
    });
    await queries.updatePhaseStatus(1, "in_progress");
    const assignment = await queries.getPhaseAssignment(1);
    expect(assignment!.status).toBe("in_progress");
  });

  it("allows claiming phase after release", async () => {
    await queries.claimPhase({
      phase_id: 1,
      assignee: "alice",
      branch_name: "gsd/phase-1-foundation",
    });
    await queries.releasePhase(1);

    // Now bob can claim the same phase
    const assignment = await queries.claimPhase({
      phase_id: 1,
      assignee: "bob",
      branch_name: "gsd/phase-1-foundation",
    });
    expect(assignment.assignee).toBe("bob");
  });
});
