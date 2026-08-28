import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { exec, execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const cwd = resolve(process.argv[2] || process.cwd());
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const safePrefixes = [
  "ls",
  "cat",
  "echo",
  "pwd",
  "which",
  "find",
  "head",
  "tail",
  "wc",
  "git log",
  "git status",
  "git diff",
];

function resolveProjectPath(filePath: string): string {
  const absolutePath = resolve(cwd, filePath);
  const relativePath = relative(cwd, absolutePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Path is outside the working directory: ${filePath}`);
  }

  return absolutePath;
}

const read = tool({
  description: `Read a file from the project. Returns numbered lines.

WHEN TO USE: viewing file contents, checking configurations, reading source
  code, examining specific lines with offset and limit.

WHEN NOT TO USE: searching across files (use grep instead), running commands
  (use bash instead).

DO NOT USE FOR: searching code, executing commands, or modifying files.

USAGE: path is relative to the working directory. offset and limit are
  optional positive integers. Output is capped at 500 lines.

EXAMPLES:
  - Read a config: path "tsconfig.json"
  - Read part of a file: path "src/index.ts", offset 20, limit 40`,
  inputSchema: z.object({
    path: z.string().describe("File path relative to working directory"),
    offset: z.number().int().positive().optional().describe("Start line (1-indexed)"),
    limit: z.number().int().positive().optional().describe("Max lines to return"),
  }),
  execute: async ({ path: filePath, offset = 1, limit }) => {
    const content = await readFile(resolveProjectPath(filePath), "utf8");
    let lines = content.split("\n").slice(offset - 1);

    if (limit) lines = lines.slice(0, limit);

    const maxLines = 500;
    const truncated = lines.length > maxLines;
    if (truncated) lines = lines.slice(0, maxLines);

    const numbered = lines.map((line, index) => `${offset + index}: ${line}`);
    return truncated
      ? `${numbered.join("\n")}\n... (truncated at ${maxLines} lines)`
      : numbered.join("\n");
  },
});

const grep = tool({
  description: `Search file contents using regex. Returns matching lines with file paths.

WHEN TO USE: finding patterns across multiple files, locating definitions,
  searching imports, finding TODOs or error messages.

WHEN NOT TO USE: reading a known file (use read instead), running commands
  (use bash instead).

DO NOT USE FOR: reading files, listing directories, or modifying files.

USAGE: pattern is an extended regular expression. path defaults to the working
  directory, glob defaults to "*", and results are capped at 50 matches.

EXAMPLES:
  - Find TODO comments: pattern "TODO", glob "*.ts"
  - Find function declarations: pattern "function \\w+", glob "*.ts"
  - Find imports: pattern "from '@ai-sdk/", glob "*.ts"`,
  inputSchema: z.object({
    pattern: z.string().describe("Extended regular expression to search for"),
    path: z.string().optional().describe("Directory to search (default: working directory)"),
    glob: z.string().optional().describe("File glob filter, e.g. '*.ts'"),
  }),
  execute: async ({ pattern, path: searchPath = ".", glob = "*" }) => {
    const directory = resolveProjectPath(searchPath);
    const args = [
      "-rn",
      "--exclude-dir=node_modules",
      "--exclude-dir=.git",
      `--include=${glob}`,
      "-E",
      "--",
      pattern,
      directory,
    ];

    let output = "";
    try {
      const { stdout } = await execFileAsync("grep", args, {
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 1_000_000,
      });
      output = stdout;
    } catch (error) {
      const result = error as NodeJS.ErrnoException & { code?: number; stdout?: string };
      if (result.code !== 1 && !result.stdout) throw error;
      output = result.stdout ?? "";
    }

    const lines = output.trim().split("\n").filter(Boolean);
    const maxMatches = 50;
    const matches = lines.slice(0, maxMatches);

    if (matches.length === 0) return "No matches found.";
    return lines.length > maxMatches
      ? `${matches.join("\n")}\n... (${lines.length} total, showing first ${maxMatches})`
      : matches.join("\n");
  },
});

interface BashOperations {
  exec(command: string): Promise<{ stdout: string; exitCode: number }>;
}

function createBashTool(
  operations: BashOperations,
  allowedPrefixes: string[],
) {
  function isSafe(command: string): boolean {
    const normalized = command.trim();
    const containsShellOperator = /[;&|><`]|\$\(/.test(normalized);
    return (
      !containsShellOperator &&
      allowedPrefixes.some(
        (prefix) => normalized === prefix || normalized.startsWith(`${prefix} `),
      )
    );
  }

  return tool({
    description: `Execute a shell command in the working directory. Returns stdout, stderr, or an exit error.

WHEN TO USE: running build commands, package scripts, tests, git operations,
  or directory listings.

WHEN NOT TO USE: reading file contents (use read instead), searching for
  patterns (use grep instead).

DO NOT USE FOR: reading files, searching code, or bypassing an approval gate.

USAGE: command is a single shell string. Only allowlisted command prefixes run
  automatically; shell operators are never considered safe.

EXAMPLES:
  - List files: command "ls -la"
  - Inspect changes: command "git diff"
  - Show recent commits: command "git log --oneline -5"`,
    inputSchema: z.object({
      command: z.string().describe("Shell command to execute"),
    }),
    execute: async ({ command }) => {
      if (!isSafe(command)) {
        return `Blocked: "${command}" requires approval. Only safe commands (${allowedPrefixes.join(", ")}) run automatically.`;
      }

      const { stdout, exitCode } = await operations.exec(command);
      return exitCode === 0 ? stdout || "(no output)" : `Exit ${exitCode}: ${stdout}`;
    },
  });
}

const localOps: BashOperations = {
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
};

const bash = createBashTool(localOps, safePrefixes);

export const agent = new ToolLoopAgent({
  model: deepseek("deepseek-v4-flash"),
  instructions: `You are a coding agent.\nWorking directory: ${cwd}`,
  tools: { read, grep, bash },
  stopWhen: stepCountIs(10),
});

if (import.meta.main) {
  const prompt = process.argv.slice(3).join(" ") || "Hello!";
  const { text, steps } = await agent.generate({ prompt });
  console.log(text);
  console.log(`\n(${steps.length} steps)`);
}
