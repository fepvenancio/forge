import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.FORGE_WEBHOOK_PORT || 3001;

app.post("/github-webhook", (req, res) => {
  console.log("Received GitHub webhook event");
  res.sendStatus(200);
});

app.post("/local-commit", (req, res) => {
  console.log("Received local commit event");
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Forge webhook server listening on port ${PORT}`);
});
