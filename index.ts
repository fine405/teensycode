import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, pruneMessages, stepCountIs } from "ai";
import { resolve } from "node:path";
import { createJustBashSandbox } from "./src/sandbox-just-bash";
import { createLocalSandbox } from "./src/sandbox-local";
import type { SandboxLifecycle } from "./src/sandbox";
import { buildSystemPrompt } from "./src/system";
import {
  createApproval,
  createAskUserTool,
  createBashTool,
  createEditTool,
  createGrepTool,
  createReadTool,
  createTaskTool,
  createWriteTool,
} from "./src/tools";

const cwd = resolve(process.argv[2] || process.cwd());
const sandboxType = process.env.SANDBOX ?? "local";
const sandbox = sandboxType === "just-bash"
  ? await createJustBashSandbox(cwd)
  : createLocalSandbox(cwd);
const lifecycle: SandboxLifecycle = {};

console.error(`Sandbox: ${sandbox.type}`);
await lifecycle.afterStart?.(sandbox);

const baseTools = {
  read: createReadTool(sandbox),
  grep: createGrepTool(sandbox),
  write: createWriteTool(sandbox),
  edit: createEditTool(sandbox),
  bash: createBashTool(sandbox, createApproval({ mode: "interactive" })),
  askUser: createAskUserTool(),
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
  const prompt = process.argv.slice(3).join(" ") || "Hello!";
  try {
    const { text, steps } = await agent.generate({ prompt });
    console.log(text);
    console.log(`\n(${steps.length} steps)`);
  } finally {
    await lifecycle.beforeStop?.(sandbox);
    await sandbox.stop();
  }
}
