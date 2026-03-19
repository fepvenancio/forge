import type { Command } from "commander";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function dashboardCommands(program: Command): void {
  program
    .command("dashboard")
    .description("Launch the Streamlit team dashboard")
    .option("--port <port>", "Port to run on", "8501")
    .action(async (opts: { port: string }) => {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const appPath = resolve(__dirname, "../../../../dashboard/app.py");

      console.log(`Launching Forge Dashboard on port ${opts.port}...`);

      const child = spawn("streamlit", ["run", appPath, "--server.port", opts.port], {
        stdio: "inherit",
        env: { ...process.env },
      });

      child.on("error", (err: Error) => {
        console.error(`Failed to launch streamlit: ${err.message}`);
        console.error("Install streamlit with: pip install streamlit");
      });
    });
}
