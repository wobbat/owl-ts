import { spawn } from "bun";

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  quiet?: boolean;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Default environment to stabilize command parsing
const defaultEnv = { LANG: "C", LC_ALL: "C" } as const;

export async function run(cmd: string, args: string[] = [], opts: RunOptions = {}): Promise<RunResult> {
  const proc = spawn([cmd, ...args], {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...defaultEnv, ...(opts.env || {}) }
  });

  let timeoutId: any;
  try {
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeoutId = setTimeout(() => proc.kill(), opts.timeoutMs);
    }
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return { code, stdout, stderr };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function runWithOutput(cmd: string, args: string[] = [], opts: RunOptions = {}): Promise<string> {
  const res = await run(cmd, args, opts);
  if (res.code !== 0) {
    // Bubble up stderr for better diagnostics; callers may catch and ignore
    throw new Error(res.stderr.trim() || `Command failed: ${cmd}`);
  }
  return res.stdout;
}

export async function runQuiet(cmd: string, args: string[] = [], opts: RunOptions = {}): Promise<void> {
  const res = await run(cmd, args, opts);
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || `Command failed: ${cmd}`);
  }
}
