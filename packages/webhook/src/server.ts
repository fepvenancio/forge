import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.FORGE_WEBHOOK_PORT || 3001;

// ─── PR Conflict Handler (CONFLICT-04) ────────────────────────────────────

interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    head: {
      ref: string;
    };
  };
  repository: {
    owner: { login: string };
    name: string;
  };
}

function isGsdBranch(ref: string): boolean {
  return /^gsd\/phase-\d+-[a-z0-9-]+$/.test(ref);
}

async function handlePullRequestOpened(payload: PullRequestPayload): Promise<string> {
  const branch = payload.pull_request.head.ref;

  if (!isGsdBranch(branch)) {
    return `Skipping non-GSD branch: ${branch}`;
  }

  try {
    // Dynamic import to avoid hard dependency on orchestrator at module load time
    const { checkConflicts } = await import("../../orchestrator/src/coordination/conflict-detector.js");
    const report = await checkConflicts();

    let body: string;
    if (report.conflicts.length === 0) {
      body = "## Forge Conflict Check\n\nNo conflicts detected across active phase branches.";
    } else {
      const lines = report.conflicts.map(
        (c: { filePath: string; phases: Array<{ phaseId: number; source: string }> }) =>
          `| \`${c.filePath}\` | ${c.phases.map((p: { phaseId: number; source: string }) => `Phase ${p.phaseId} (${p.source})`).join(", ")} |`
      );
      body = `## Forge Conflict Check\n\nFound **${report.conflicts.length}** file conflict(s):\n\n| File | Conflicting Phases |\n|------|--------------------|\n${lines.join("\n")}`;

      if (report.lockWarnings.length > 0) {
        body += `\n\n### Lock Warnings\n\n${report.lockWarnings.map(
          (lw: { filePath: string; lockedBy: string; phaseId: number; conflictingPhases: number[] }) =>
            `- \`${lw.filePath}\` locked by ${lw.lockedBy} (phase ${lw.phaseId}), modified by phase(s) ${lw.conflictingPhases.join(", ")}`
        ).join("\n")}`;
      }
    }

    // Post PR comment via @octokit/rest
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      const { Octokit } = await import("@octokit/rest");
      const octokit = new Octokit({ auth: token });
      await octokit.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.number,
        body,
      });
      return `Posted conflict report to PR #${payload.number}`;
    } else {
      console.log("GITHUB_TOKEN not set -- conflict report not posted to PR");
      console.log(body);
      return "Conflict check completed (no GITHUB_TOKEN to post comment)";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Conflict check failed: ${msg}`);
    return `Conflict check failed: ${msg}`;
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

app.post("/github-webhook", async (req, res) => {
  const event = req.headers["x-github-event"] as string;

  if (!event) {
    res.status(400).json({ error: "Missing X-GitHub-Event header" });
    return;
  }

  console.log(`Received GitHub webhook event: ${event}`);

  if (event === "pull_request") {
    const payload = req.body as PullRequestPayload;

    if (!payload.action || !payload.pull_request?.head?.ref) {
      res.status(400).json({ error: "Invalid pull_request payload" });
      return;
    }

    if (payload.action === "opened") {
      const result = await handlePullRequestOpened(payload);
      console.log(result);
      res.status(200).json({ message: result });
      return;
    }
  }

  res.sendStatus(200);
});

app.post("/local-commit", (req, res) => {
  console.log("Received local commit event");
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Forge webhook server listening on port ${PORT}`);
});

export { app, handlePullRequestOpened, isGsdBranch };
