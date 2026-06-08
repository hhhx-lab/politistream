import { execFile } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { performance } from "perf_hooks";
import { promisify } from "util";
import { AnalyticsWorkerCommand, AnalyticsWorkerCommandName, AnalyticsWorkerRunResult } from "./types";

const execFileAsync = promisify(execFile);

export interface BuildAnalyticsWorkerCommandInput {
  command: AnalyticsWorkerCommandName;
  inputPath: string;
  outputPath: string;
  env?: Record<string, string | undefined>;
}

export interface RunAnalyticsWorkerInput {
  command: AnalyticsWorkerCommandName;
  rows: Array<Record<string, unknown>>;
  timeoutMs?: number;
  tmpRoot?: string;
  env?: NodeJS.ProcessEnv;
}

export function buildAnalyticsWorkerCommand(input: BuildAnalyticsWorkerCommandInput): AnalyticsWorkerCommand {
  const env = input.env ?? process.env;
  const cwd = env.ANALYTICS_WORKER_DIR || path.resolve(process.cwd(), "workers-analytics");
  const projectPython = path.join(cwd, ".venv/bin/python");
  return {
    file: env.ANALYTICS_PYTHON_BIN || (existsSync(projectPython) ? projectPython : "python3"),
    cwd,
    args: [
      "-m",
      "politistream_analytics.worker",
      input.command,
      "--input",
      input.inputPath,
      "--output",
      input.outputPath,
    ],
  };
}

export async function runAnalyticsWorker(input: RunAnalyticsWorkerInput): Promise<AnalyticsWorkerRunResult> {
  const tmpRoot = input.tmpRoot ?? tmpdir();
  const workDir = await mkdtemp(path.join(tmpRoot, "politistream-analytics-"));
  const inputPath = path.join(workDir, "input.json");
  const outputPath = path.join(workDir, "output.json");
  const started = performance.now();

  try {
    await writeFile(inputPath, JSON.stringify({ rows: input.rows }, null, 2), "utf-8");
    const command = buildAnalyticsWorkerCommand({
      command: input.command,
      inputPath,
      outputPath,
      env: input.env,
    });
    await execFileAsync(command.file, command.args, {
      cwd: command.cwd,
      timeout: input.timeoutMs ?? Number(input.env?.ANALYTICS_WORKER_TIMEOUT_MS || process.env.ANALYTICS_WORKER_TIMEOUT_MS || 120000),
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONPATH: command.cwd,
        ...(input.env ?? {}),
      },
    });
    const result = JSON.parse(await readFile(outputPath, "utf-8"));
    return {
      command: input.command,
      engine: "python-worker",
      result,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
