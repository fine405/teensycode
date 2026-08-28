import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, stepCountIs } from "ai";
import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { Sandbox } from "./src/sandbox";
import { buildSystemPrompt } from "./src/system";
import {
  createApproval,
  createBashTool,
  createGrepTool,
  createReadTool,
} from "./src/tools";

const cwd = resolve(process.argv[2] || process.cwd());
const execAsync = promisify(exec);

function resolveProjectPath(path: string): string {
  const absolutePath = resolve(cwd, path);
  const relativePath = relative(cwd, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Path is outside the working directory: ${path}`);
  }
  return absolutePath;
}

const sandbox: Sandbox = {
  type: "local-inline",
  workingDirectory: cwd,
  readFile: async (path) => readFile(resolveProjectPath(path), "utf8"),
  exec: async (command) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        encoding: "utf8",
        timeout: 30_000,
      });
      return { stdout: stdout || stderr, exitCode: 0 };
    } catch (error) {
      const result = error as Error & {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        stdout: result.stdout || result.stderr || result.message,
        exitCode: result.code ?? 1,
      };
    }
  },
  stop: async () => {},
};

const tools = {
  read: createReadTool(sandbox),
  grep: createGrepTool(sandbox),
  bash: createBashTool(sandbox, createApproval({ mode: "interactive" })),
};
const projectContext = await sandbox.readFile("AGENTS.md").catch(() => undefined);
const instructions = buildSystemPrompt({
  workingDirectory: sandbox.workingDirectory,
  sandboxType: sandbox.type,
  toolNames: Object.keys(tools),
  projectContext,
});

export const agent = new ToolLoopAgent({
  model: deepseek("deepseek-v4-flash"),
  instructions,
  tools,
  stopWhen: stepCountIs(10),
});

if (import.meta.main) {
  const prompt = process.argv.slice(3).join(" ") || "Hello!";
  const { text, steps } = await agent.generate({ prompt });
  console.log(text);
  console.log(`\n(${steps.length} steps)`);
}
