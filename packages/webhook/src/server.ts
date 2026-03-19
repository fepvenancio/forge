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

async function postOrUpdateComment(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  marker: string,
  body: string,
): Promise<void> {
  const markedBody = `${marker}\n${body}`;

  // Look for existing comment with this marker
  const { data: comments } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
  });

  const existing = comments.find((c: any) => c.body?.includes(marker));

  if (existing) {
    await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: markedBody,
    });
  } else {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: markedBody,
    });
  }
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

      // Post conflict report comment
      await postOrUpdateComment(
        octokit,
        payload.repository.owner.login,
        payload.repository.name,
        payload.number,
        "<!-- forge-conflict-check -->",
        body,
      );

      // ─── Merge Order Comment (MERGE-03) ──────────────────────────────
      try {
        const { getMergeOrderForOpenPRs } = await import("../../orchestrator/src/coordination/merge-engine.js");
        const mergeOrder = await getMergeOrderForOpenPRs();

        if (mergeOrder.order.length >= 2) {
          const orderLines = mergeOrder.order.map(
            (phaseId: number, idx: number) => `| ${idx + 1} | Phase ${phaseId} |`
          );
          let mergeBody = `## Forge Merge Order\n\nSuggested merge order for open PRs:\n\n| Order | Phase |\n|-------|-------|\n${orderLines.join("\n")}`;

          if (mergeOrder.reasoning.length > 0) {
            mergeBody += `\n\n### Reasoning\n\n${mergeOrder.reasoning.map((r: string) => `- ${r}`).join("\n")}`;
          }

          if (mergeOrder.cycles.length > 0) {
            mergeBody += `\n\n### Dependency Cycles\n\n${mergeOrder.cycles.map((c: number[]) => `- Phases ${c.join(", ")} form a cycle`).join("\n")}`;
          }

          await postOrUpdateComment(
            octokit,
            payload.repository.owner.login,
            payload.repository.name,
            payload.number,
            "<!-- forge-merge-order -->",
            mergeBody,
          );
        }
      } catch (mergeErr) {
        const mergeMsg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
        console.error(`[merge-order] Failed to post merge order: ${mergeMsg}`);
      }

      // ─── Escalation (ESC-01, ESC-02) ────────────────────────────────
      if (report.conflicts.length > 0) {
        try {
          const { escalateConflicts } = await import("../../orchestrator/src/coordination/escalation.js");
          const queries = await import("../../orchestrator/src/dolt/queries.js");
          const assignments = await queries.getAllPhaseAssignments();
          const developers = await queries.getAllDevelopers();
          await escalateConflicts(report, assignments, developers);
        } catch (escErr) {
          const escMsg = escErr instanceof Error ? escErr.message : String(escErr);
          console.error(`[escalation] Failed to escalate conflicts: ${escMsg}`);
        }
      }

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

// ─── Push Event Handler (FLOW-02) ───────────────────────────────────────────

interface PushPayload {
  ref: string; // "refs/heads/gsd/phase-1-foundation"
  commits: Array<{
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  repository: {
    owner: { login: string };
    name: string;
  };
}

function extractChangedFiles(payload: PushPayload): string[] {
  const files = new Set<string>();
  for (const commit of payload.commits) {
    for (const f of commit.added) files.add(f);
    for (const f of commit.modified) files.add(f);
    for (const f of commit.removed) files.add(f);
  }
  return [...files];
}

async function handlePushEvent(payload: PushPayload): Promise<string> {
  const branch = payload.ref.replace("refs/heads/", "");

  if (!isGsdBranch(branch)) {
    return `Skipping non-GSD branch: ${branch}`;
  }

  const changedFiles = extractChangedFiles(payload);

  if (changedFiles.length === 0) {
    return "No flows affected";
  }

  try {
    const queries = await import("../../orchestrator/src/dolt/queries.js");
    let staleCount = 0;

    for (const file of changedFiles) {
      const flows = await queries.getFlowsForFile(file);
      for (const flow of flows) {
        await queries.markFlowStale(flow.id);
        staleCount++;
      }
    }

    if (staleCount === 0) {
      return "No flows affected";
    }

    return `Marked ${staleCount} flow(s) as stale for ${changedFiles.length} changed file(s)`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[push-handler] Dolt unavailable: ${msg}`);
    return "Push processed (Dolt unavailable, flow staleness not updated)";
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

  if (event === "push") {
    const result = await handlePushEvent(req.body as PushPayload);
    console.log(result);
    res.status(200).json({ message: result });
    return;
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

export { app, handlePullRequestOpened, handlePushEvent, extractChangedFiles, isGsdBranch };
