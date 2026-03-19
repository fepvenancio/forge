import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSpawn = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

import { dashboardCommands } from "../../../packages/orchestrator/src/commands/dashboard.js";

describe("dashboard command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock spawn to return an event emitter-like object
    mockSpawn.mockReturnValue({
      on: vi.fn(),
    });
  });

  it("registers dashboard command on a program", () => {
    const commands: string[] = [];
    const mockCmd: any = {
      description: () => mockCmd,
      option: () => mockCmd,
      action: () => mockCmd,
    };
    const program: any = {
      command: (name: string) => {
        commands.push(name);
        return mockCmd;
      },
    };

    dashboardCommands(program);
    expect(commands).toContain("dashboard");
  });

  it("spawns streamlit with correct app.py path", async () => {
    let actionFn: Function = () => {};
    const mockCmd: any = {
      description: () => mockCmd,
      option: () => mockCmd,
      action: (fn: Function) => { actionFn = fn; return mockCmd; },
    };
    const program: any = {
      command: () => mockCmd,
    };

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    dashboardCommands(program);
    await actionFn({ port: "8501" });

    console.log = origLog;

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("streamlit");
    expect(args[0]).toBe("run");
    expect(args[1]).toContain("app.py");
  });

  it("passes --port option to streamlit", async () => {
    let actionFn: Function = () => {};
    const mockCmd: any = {
      description: () => mockCmd,
      option: () => mockCmd,
      action: (fn: Function) => { actionFn = fn; return mockCmd; },
    };
    const program: any = {
      command: () => mockCmd,
    };

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    dashboardCommands(program);
    await actionFn({ port: "9999" });

    console.log = origLog;

    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("--server.port");
    expect(args).toContain("9999");
  });

  it("shows error message when streamlit not installed", async () => {
    // Mock spawn to trigger error event
    mockSpawn.mockReturnValue({
      on: vi.fn().mockImplementation((event: string, cb: Function) => {
        if (event === "error") {
          setTimeout(() => cb(new Error("ENOENT")), 0);
        }
      }),
    });

    let actionFn: Function = () => {};
    const mockCmd: any = {
      description: () => mockCmd,
      option: () => mockCmd,
      action: (fn: Function) => { actionFn = fn; return mockCmd; },
    };
    const program: any = {
      command: () => mockCmd,
    };

    const errors: string[] = [];
    const origError = console.error;
    const origLog = console.log;
    console.error = (...args: any[]) => errors.push(args.join(" "));
    console.log = () => {};

    dashboardCommands(program);
    await actionFn({ port: "8501" });

    // Wait for the setTimeout to fire
    await new Promise(resolve => setTimeout(resolve, 10));

    console.error = origError;
    console.log = origLog;

    const errorOutput = errors.join("\n");
    expect(errorOutput).toContain("streamlit");
  });
});
