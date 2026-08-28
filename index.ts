import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, stepCountIs } from "ai";
import { resolve } from "node:path";
import { createJustBashSandbox } from "./src/sandbox-just-bash";
import { createLocalSandbox } from "./src/sandbox-local";
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
console.error(`Sandbox: ${sandbox.type}`);

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
