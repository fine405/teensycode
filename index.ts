import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, pruneMessages, stepCountIs } from "ai";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createJustBashSandbox } from "./src/sandbox-just-bash";
import { createLocalSandbox } from "./src/sandbox-local";
import type { SandboxLifecycle } from "./src/sandbox";
import { discoverSkills } from "./src/skills";
import { buildSystemPrompt } from "./src/system";
import {
  createApproval,
  createAskUserTool,
  createBashTool,
  createEditTool,
  createGrepTool,
  createLoadSkillTool,
  createReadTool,
  createTaskTool,
  createTodoTool,
  createWriteTool,
} from "./src/tools";
import { discoverVerificationCommands } from "./src/verification";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    sandbox: { type: "string", default: process.env.SANDBOX ?? "local" },
    model: {
      type: "string",
      default: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    },
  },
  allowPositionals: true,
});

const cwd = resolve(positionals[0] || process.cwd());
const prompt = positionals.slice(1).join(" ") || "Hello!";

async function sandboxFromFlag(name: string) {
  if (name === "local") return createLocalSandbox(cwd);
  if (name === "just-bash") return createJustBashSandbox(cwd);
  throw new Error(`Unknown sandbox: ${name}. Expected local or just-bash.`);
}

const sandbox = await sandboxFromFlag(values.sandbox);
const lifecycle: SandboxLifecycle = {};
const skillDirectories = [
  join(cwd, "skills"),
  ...(process.env.HOME
    ? [join(process.env.HOME, ".harness", "skills")]
    : []),
];
const skills = discoverSkills(skillDirectories);

console.error(`Sandbox: ${sandbox.type}`);
await lifecycle.afterStart?.(sandbox);

const baseTools = {
  read: createReadTool(sandbox),
  grep: createGrepTool(sandbox),
  write: createWriteTool(sandbox),
  edit: createEditTool(sandbox),
  bash: createBashTool(sandbox, createApproval({ mode: "interactive" })),
  askUser: createAskUserTool(),
  todo: createTodoTool(),
  loadSkill: createLoadSkillTool(skills),
};
const tools = {
  ...baseTools,
  task: createTaskTool(sandbox, {
    read: baseTools.read,
    grep: baseTools.grep,
    write: baseTools.write,
    edit: baseTools.edit,
  }),
};
const projectContext = await sandbox.readFile("AGENTS.md").catch(() => undefined);
const verificationCommands = await discoverVerificationCommands(sandbox);
const instructions = buildSystemPrompt({
  workingDirectory: sandbox.workingDirectory,
  sandboxType: sandbox.type,
  toolNames: Object.keys(tools),
  projectContext,
  verificationCommands,
  skills: skills.map(({ name, description }) => ({ name, description })),
});

export const agent = new ToolLoopAgent({
  model: deepseek(values.model),
  instructions,
  tools,
  stopWhen: stepCountIs(10),
  prepareCall: (options) => ({
    ...options,
    messages: options.messages
      ? pruneMessages({
          messages: options.messages,
          toolCalls: "before-last-3-messages",
        })
      : undefined,
  }),
  onStepFinish: ({ usage, stepNumber }) => {
    console.error(
      `Step ${stepNumber}: ${usage.inputTokens ?? 0} input, ${usage.outputTokens ?? 0} output, ${usage.cachedInputTokens ?? 0} cached`,
    );
  },
});

if (import.meta.main) {
  let stopped = false;
  const stopSandbox = async () => {
    if (stopped) return;
    stopped = true;
    await lifecycle.beforeStop?.(sandbox);
    await sandbox.stop();
  };

  process.once("SIGINT", async () => {
    console.error("\nShutting down...");
    await stopSandbox();
    process.exit(0);
  });

  try {
    const result = await agent.stream({ prompt });

    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        process.stdout.write(chunk.text);
      } else if (chunk.type === "tool-call") {
        console.error(`\n[tool] ${chunk.toolName}(${JSON.stringify(chunk.input)})`);
      } else if (chunk.type === "tool-result") {
        const serialized = typeof chunk.output === "string"
          ? chunk.output
          : JSON.stringify(chunk.output) ?? String(chunk.output);
        console.error(`  -> ${serialized.slice(0, 100)}`);
      } else if (chunk.type === "tool-error") {
        console.error(`  -> error: ${String(chunk.error)}`);
      }
    }

    process.stdout.write("\n");
  } finally {
    await stopSandbox();
  }
}
