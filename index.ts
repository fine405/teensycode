import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, stepCountIs } from "ai";
import { resolve } from "node:path";
import { createJustBashSandbox } from "./src/sandbox-just-bash";
import { createLocalSandbox } from "./src/sandbox-local";
import type { SandboxLifecycle } from "./src/sandbox";
import { buildSystemPrompt } from "./src/system";
import {
  createApproval,
  createBashTool,
  createGrepTool,
  createReadTool,
} from "./src/tools";

const cwd = resolve(process.argv[2] || process.cwd());
const sandboxType = process.env.SANDBOX ?? "local";
const sandbox = sandboxType === "just-bash"
  ? await createJustBashSandbox(cwd)
  : createLocalSandbox(cwd);
const lifecycle: SandboxLifecycle = {};

console.error(`Sandbox: ${sandbox.type}`);
await lifecycle.afterStart?.(sandbox);

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
  onStepFinish: ({ usage, stepNumber }) => {
    console.error(
      `Step ${stepNumber}: ${usage.inputTokens ?? 0} input, ${usage.outputTokens ?? 0} output`,
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
