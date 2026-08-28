import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, pruneMessages, stepCountIs, tool } from "ai";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { createEventBus, wrapToolWithEvents } from "./src/events";
import { createRegistry, registerBuiltins } from "./src/registry";
import { createJustBashSandbox } from "./src/sandbox-just-bash";
import { createLocalSandbox } from "./src/sandbox-local";
import type { SandboxLifecycle } from "./src/sandbox";
import { discoverSkills } from "./src/skills";
import { buildSystemPrompt } from "./src/system";
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
export const events = createEventBus();
events.on("session_start", async ({ sandbox }) => {
  await lifecycle.afterStart?.(sandbox);
});
events.on("session_shutdown", async ({ sandbox }) => {
  await lifecycle.beforeStop?.(sandbox);
});
const skillDirectories = [
  join(cwd, "skills"),
  ...(process.env.HOME
    ? [join(process.env.HOME, ".harness", "skills")]
    : []),
];
const skills = discoverSkills(skillDirectories);

console.error(`Sandbox: ${sandbox.type}`);
const start = await events.emit("session_start", { sandbox });
if (start.blocked) {
  await sandbox.stop();
  throw new Error(start.reason);
}

const registry = createRegistry();
registerBuiltins(registry, sandbox, skills);
registry.register(
  "now",
  tool({
    description: "Return the current timestamp as an ISO 8601 string.",
    inputSchema: z.object({}),
    execute: async () => new Date().toISOString(),
  }),
);
for (const [name, registeredTool] of registry.entries()) {
  registry.register(name, wrapToolWithEvents(name, registeredTool, events));
}
const tools = Object.fromEntries(registry.entries());
const projectContext = await sandbox.readFile("AGENTS.md").catch(() => undefined);
const verificationCommands = await discoverVerificationCommands(sandbox);
const instructions = buildSystemPrompt({
  workingDirectory: sandbox.workingDirectory,
  sandboxType: sandbox.type,
  toolNames: registry.list(),
  projectContext,
  verificationCommands,
  skills: skills.map(({ name, description }) => ({ name, description })),
});

export const agent = new ToolLoopAgent({
  model: deepseek(values.model),
  instructions,
  tools,
  stopWhen: stepCountIs(10),
  prepareCall: async (options) => {
    const compact = await events.emit("session_before_compact", {
      messages: options.messages,
      instructions: options.instructions,
      customInstructions: undefined as string | undefined,
    });
    if (compact.blocked) throw new Error(compact.reason);

    const extra = compact.data.customInstructions;
    return {
      ...options,
      instructions: extra
        ? `${compact.data.instructions ?? ""}\n${extra}`
        : compact.data.instructions,
      messages: compact.data.messages
        ? pruneMessages({
            messages: compact.data.messages,
            toolCalls: "before-last-3-messages",
          })
        : undefined,
    };
  },
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
    try {
      await events.emit("session_shutdown", { sandbox });
    } finally {
      await sandbox.stop();
    }
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
