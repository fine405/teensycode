import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

const cwd = resolve(process.argv[2] || process.cwd());

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
WHEN TO USE: viewing file contents, checking configs, reading source code.
WHEN NOT TO USE: searching across files (use grep instead).`,
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

export const agent = new ToolLoopAgent({
  model: deepseek("deepseek-v4-flash"),
  instructions: `You are a coding agent.\nWorking directory: ${cwd}`,
  tools: { read },
  stopWhen: stepCountIs(10),
});

if (import.meta.main) {
  const prompt = process.argv.slice(3).join(" ") || "Hello!";
  const { text, steps } = await agent.generate({ prompt });
  console.log(text);
  console.log(`\n(${steps.length} steps)`);
}
