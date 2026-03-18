import { spawn } from "node:child_process";
import { execSync } from "node:child_process";

export interface ClaudeCodeOptions {
  prompt: string;
  systemPrompt?: string;
  cwd?: string;
  model?: string;
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
  /** Allow Claude to read/write files in cwd (adds --dangerously-skip-permissions). Required for workers. */
  dangerouslySkipPermissions?: boolean;
  /** Max budget in USD for this invocation. */
  maxBudgetUsd?: number;
}

export interface ClaudeCodeResult {
  result: string;
  costUsd: number;
  usage: { inputTokens: number; outputTokens: number };
}

let claudeChecked = false;

function ensureClaudeInstalled(): void {
  if (claudeChecked) return;
  try {
    execSync("which claude", { encoding: "utf8", stdio: "pipe" });
    claudeChecked = true;
  } catch {
    throw new Error(
      "Claude Code CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code and ensure `claude` is on your PATH.",
    );
  }
}

/**
 * Invoke Claude Code CLI (`claude -p`) as a subprocess.
 * Returns structured JSON output from `--output-format json`.
 */
export async function claudeCode(options: ClaudeCodeOptions): Promise<ClaudeCodeResult> {
  ensureClaudeInstalled();

  const {
    prompt,
    systemPrompt,
    cwd,
    model,
    jsonSchema,
    timeoutMs = 600_000,
    dangerouslySkipPermissions = false,
    maxBudgetUsd,
  } = options;

  const args = ["-p", "--output-format", "json"];

  if (dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  if (maxBudgetUsd !== undefined) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }

  if (model) {
    args.push("--model", model);
  }

  if (systemPrompt) {
    args.push("--system-prompt", systemPrompt);
  }

  if (jsonSchema) {
    args.push("--json-schema", JSON.stringify(jsonSchema));
  }

  return new Promise<ClaudeCodeResult>((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd: cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Claude Code timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`Claude Code exited with code ${code}: ${stderr.slice(0, 1000)}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        // claude -p --output-format json returns { result, is_error, cost_usd, ... }
        resolve({
          result: typeof parsed.result === "string" ? parsed.result : JSON.stringify(parsed.result),
          costUsd: parsed.cost_usd ?? 0,
          usage: {
            inputTokens: parsed.usage?.input_tokens ?? 0,
            outputTokens: parsed.usage?.output_tokens ?? 0,
          },
        });
      } catch {
        // If stdout isn't JSON, treat it as raw text result
        resolve({
          result: stdout.trim(),
          costUsd: 0,
          usage: { inputTokens: 0, outputTokens: 0 },
        });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    // Send prompt via stdin
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
