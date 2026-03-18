import express from "express";
import { verifyGitHubSignature } from "./verify.js";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.FORGE_WEBHOOK_PORT || "3001", 10);

interface LibrarianTrigger {
  files: string[];
  sha: string;
  source: "github" | "local";
  timestamp: number;
}

// Queue for Librarian triggers — consumed by orchestrator
const triggerQueue: LibrarianTrigger[] = [];

export function getTriggerQueue(): LibrarianTrigger[] {
  return triggerQueue;
}

export function popTrigger(): LibrarianTrigger | undefined {
  return triggerQueue.shift();
}

// GitHub webhook endpoint
app.post("/github-webhook", (req, res) => {
  const signature = req.headers["x-hub-signature-256"] as string;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    console.error("GITHUB_WEBHOOK_SECRET not set");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  if (!signature || !verifyGitHubSignature(JSON.stringify(req.body), signature, secret)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const payload = req.body;

  // Extract changed files from push event
  const files: string[] = [];
  if (payload.commits) {
    for (const commit of payload.commits) {
      files.push(...(commit.added || []));
      files.push(...(commit.modified || []));
      files.push(...(commit.removed || []));
    }
  }

  const trigger: LibrarianTrigger = {
    files: [...new Set(files)],
    sha: payload.after || payload.head_commit?.id || "unknown",
    source: "github",
    timestamp: Date.now(),
  };

  triggerQueue.push(trigger);
  console.log(`[webhook] GitHub push: ${trigger.files.length} files changed (${trigger.sha.slice(0, 7)})`);

  res.status(200).json({ status: "ok", files_count: trigger.files.length });
});

// Local commit endpoint (no auth — localhost only)
app.post("/local-commit", (req, res) => {
  const { files, sha } = req.body;

  if (!files || !Array.isArray(files)) {
    res.status(400).json({ error: "Missing or invalid 'files' array" });
    return;
  }

  const trigger: LibrarianTrigger = {
    files,
    sha: sha || "local",
    source: "local",
    timestamp: Date.now(),
  };

  triggerQueue.push(trigger);
  console.log(`[webhook] Local commit: ${trigger.files.length} files changed (${trigger.sha.slice(0, 7)})`);

  res.status(200).json({ status: "ok", files_count: trigger.files.length });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", queue_size: triggerQueue.length });
});

app.listen(PORT, () => {
  console.log(`[webhook] Forge webhook server listening on port ${PORT}`);
});

export default app;
