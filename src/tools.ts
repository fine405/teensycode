import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { isAbsolute, normalize } from "node:path";
import { z } from "zod";
import type { Sandbox } from "./sandbox";

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

export type ApprovalConfig =
  | { mode: "interactive" }
  | { mode: "background" }
  | { mode: "delegated"; trust: string[] };

export type NeedsApproval = (input: { command: string }) => boolean;

function matchesPrefix(command: string, prefixes: string[]): boolean {
  const normalized = command.trim();
  if (/[;&|><`]|\$\(/.test(normalized)) return false;
  return prefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix} `),
  );
}

export function createApproval(config: ApprovalConfig): NeedsApproval {
  return ({ command }) => {
    if (config.mode === "background") return false;
    if (config.mode === "delegated") {
      return !matchesPrefix(command, config.trust);
    }
    return !matchesPrefix(command, safePrefixes);
  };
}

function projectPath(path: string): string {
  const normalized = normalize(path);
  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Path is outside the working directory: ${path}`);
  }
  return normalized;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function createReadTool(sandbox: Sandbox) {
  return tool({
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
    execute: async ({ path, offset = 1, limit }) => {
      const content = await sandbox.readFile(projectPath(path));
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
}

export function createGrepTool(sandbox: Sandbox) {
  return tool({
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
    execute: async ({ pattern, path = ".", glob = "*" }) => {
      const command = [
        "grep -rn",
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        `--include=${shellQuote(glob)}`,
        "-E --",
        shellQuote(pattern),
        shellQuote(projectPath(path)),
      ].join(" ");
      const result = await sandbox.exec(command);
      const lines = result.stdout.trim().split("\n").filter(Boolean);
      const maxMatches = 50;
      const matches = lines.slice(0, maxMatches);

      if (matches.length === 0) return "No matches found.";
      return lines.length > maxMatches
        ? `${matches.join("\n")}\n... (${lines.length} total, showing first ${maxMatches})`
        : matches.join("\n");
    },
  });
}

export function createBashTool(
  sandbox: Sandbox,
  needsApproval: NeedsApproval,
) {
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
      if (needsApproval({ command })) {
        return `Blocked: "${command}" requires approval.`;
      }

      const result = await sandbox.exec(command);
      const maxCharacters = 5_000;
      const output = result.stdout || "(no output)";
      const boundedOutput = output.length > maxCharacters
        ? `${output.slice(-maxCharacters)}\n... (truncated, showing last ${maxCharacters} chars)`
        : output;

      return result.exitCode === 0
        ? boundedOutput
        : `Exit ${result.exitCode}: ${boundedOutput}`;
    },
  });
}

export function createWriteTool(sandbox: Sandbox) {
  return tool({
    description: `Write complete UTF-8 content to a project file.

WHEN TO USE: creating a new file or intentionally replacing a whole small file.

WHEN NOT TO USE: changing a localized part of an existing file (use edit).

DO NOT USE FOR: reading, searching, or appending uncertain content.

USAGE: path is relative to the working directory. content replaces the entire
  file, so read an existing file first.

EXAMPLES:
  - Create a file: path "src/example.ts", content "export const value = 1;"`,
    inputSchema: z.object({
      path: z.string().describe("File path relative to working directory"),
      content: z.string().describe("Complete UTF-8 file content"),
    }),
    execute: async ({ path, content }) => {
      const safePath = projectPath(path);
      await sandbox.writeFile(safePath, content);
      return `Wrote ${content.length} characters to ${safePath}.`;
    },
  });
}

export function createEditTool(sandbox: Sandbox) {
  return tool({
    description: `Replace one exact text occurrence in an existing project file.

WHEN TO USE: making a focused, deterministic change after reading the file.

WHEN NOT TO USE: creating files or replacing a whole file (use write).

DO NOT USE FOR: ambiguous replacements that occur more than once.

USAGE: oldText must be non-empty and occur exactly once. The edit is rejected
  when the match is missing or ambiguous.

EXAMPLES:
  - Rename one declaration: path "src/a.ts", oldText "const oldName", newText "const newName"`,
    inputSchema: z.object({
      path: z.string().describe("File path relative to working directory"),
      oldText: z.string().min(1).describe("Exact text that must occur once"),
      newText: z.string().describe("Replacement text"),
    }),
    execute: async ({ path, oldText, newText }) => {
      const safePath = projectPath(path);
      const content = await sandbox.readFile(safePath);
      const matches = content.split(oldText).length - 1;
      if (matches === 0) return `Edit rejected: text was not found in ${safePath}.`;
      if (matches > 1) {
        return `Edit rejected: text occurs ${matches} times in ${safePath}; provide more context.`;
      }

      await sandbox.writeFile(safePath, content.replace(oldText, newText));
      return `Edited ${safePath}.`;
    },
  });
}

interface ParentAgentTools {
  read: ReturnType<typeof createReadTool>;
  grep: ReturnType<typeof createGrepTool>;
  write: ReturnType<typeof createWriteTool>;
  edit: ReturnType<typeof createEditTool>;
}

function buildExplorer(sandbox: Sandbox, parentTools: ParentAgentTools) {
  const model = deepseek("deepseek-v4-flash");
  const stepBudget = 5;

  return new ToolLoopAgent({
    model,
    instructions: `You are an explorer agent. Investigate with read and grep, then report back concisely.
Working directory: ${sandbox.workingDirectory}
Do not make changes or ask the user questions.`,
    tools: {
      read: parentTools.read,
      grep: parentTools.grep,
    },
    stopWhen: stepCountIs(stepBudget),
  });
}

function buildExecutor(sandbox: Sandbox, parentTools: ParentAgentTools) {
  const model = deepseek("deepseek-v4-pro");
  const stepBudget = 15;
  const bash = createBashTool(
    sandbox,
    createApproval({
      mode: "delegated",
      trust: ["npm test", "npm run typecheck", "npm run build", "npx tsc"],
    }),
  );

  return new ToolLoopAgent({
    model,
    instructions: `You are an executor agent. Follow the delegated instructions precisely.
Working directory: ${sandbox.workingDirectory}
Do not ask questions or explore beyond what the task needs. Make the requested
change, run an allowed verification command, and report the exact result.`,
    tools: {
      read: parentTools.read,
      grep: parentTools.grep,
      write: parentTools.write,
      edit: parentTools.edit,
      bash,
    },
    stopWhen: stepCountIs(stepBudget),
  });
}

type Subagent = ReturnType<typeof buildExplorer> | ReturnType<typeof buildExecutor>;

async function runSubagent(
  role: "Explorer" | "Executor",
  agent: Subagent,
  description: string,
): Promise<string> {
  try {
    const { text, steps } = await agent.generate({ prompt: description });
    return text
      ? `[${role}: ${steps.length} steps]\n${text}`
      : `(no response from ${role.toLowerCase()})`;
  } catch (error) {
    return `${role} error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function createTaskTool(
  sandbox: Sandbox,
  parentTools: ParentAgentTools,
) {
  return tool({
    description: `Delegate work to a scoped subagent.

Explorer (default): read-only research with DeepSeek V4 Flash.
Executor: focused implementation with DeepSeek V4 Pro, write/edit, and a
  delegated bash trust slice.

WHEN TO USE: broad codebase research (explorer) or explicit mechanical changes
  with known verification steps (executor).

WHEN NOT TO USE: ambiguous requirements or architectural decisions.

DO NOT USE FOR: user questions or single-step work the parent can do directly.

USAGE: give the subagent a precise goal, constraints, and expected report.`,
    inputSchema: z.object({
      description: z.string().describe("Task instructions for the subagent"),
      subagentType: z
        .enum(["explorer", "executor"])
        .default("explorer")
        .describe("Subagent role"),
    }),
    execute: async ({ description, subagentType }) => {
      const role = subagentType === "executor" ? "Executor" : "Explorer";
      const agent = subagentType === "executor"
        ? buildExecutor(sandbox, parentTools)
        : buildExplorer(sandbox, parentTools);
      return runSubagent(role, agent, description);
    },
  });
}
