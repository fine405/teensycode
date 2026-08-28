import { tool, type Tool } from "ai";
import type { Sandbox } from "./sandbox";
import type { Skill } from "./skills";
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
} from "./tools";

export interface ToolRegistry {
  register(name: string, registeredTool: Tool): void;
  get(name: string): Tool | undefined;
  list(): string[];
  entries(): [string, Tool][];
}

export function createRegistry(): ToolRegistry {
  const tools = new Map<string, Tool>();

  return {
    register: (name, registeredTool) => tools.set(name, registeredTool),
    get: (name) => tools.get(name),
    list: () => [...tools.keys()],
    entries: () => [...tools.entries()],
  };
}

export function registerBuiltins(
  registry: ToolRegistry,
  sandbox: Sandbox,
  skills: Skill[],
) {
  const read = createReadTool(sandbox);
  const grep = createGrepTool(sandbox);
  const write = createWriteTool(sandbox);
  const edit = createEditTool(sandbox);

  registry.register("read", read);
  registry.register("grep", grep);
  registry.register("write", write);
  registry.register("edit", edit);
  registry.register(
    "bash",
    createBashTool(sandbox, createApproval({ mode: "interactive" })),
  );
  registry.register("askUser", createAskUserTool());
  registry.register("todo", createTodoTool());
  registry.register(
    "task",
    createTaskTool(sandbox, { read, grep, write, edit }),
  );
  registry.register("loadSkill", createLoadSkillTool(skills));
}

interface WrapHooks {
  beforeExecute?: (input: any) => any | Promise<any>;
  afterExecute?: (result: any) => any | Promise<any>;
}

export function wrapTool(base: Tool, hooks: WrapHooks): Tool {
  if (!base.execute) throw new Error("Cannot wrap a tool without execute");

  return tool({
    description: base.description,
    inputSchema: base.inputSchema,
    execute: async (input, options) => {
      const transformed = hooks.beforeExecute
        ? await hooks.beforeExecute(input)
        : input;
      const result = await base.execute!(transformed, options);
      return hooks.afterExecute ? hooks.afterExecute(result) : result;
    },
  });
}
