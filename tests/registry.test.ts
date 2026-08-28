import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { z } from "zod";
import {
  createRegistry,
  registerBuiltins,
  wrapTool,
} from "../src/registry";
import type { Sandbox } from "../src/sandbox";

const executionOptions = { toolCallId: "test", messages: [] };

describe("tool registry", () => {
  test("registers the complete built-in tool set", () => {
    const sandbox: Sandbox = {
      type: "test",
      workingDirectory: "/project",
      readFile: async () => "",
      writeFile: async () => {},
      exec: async () => ({ stdout: "", exitCode: 0 }),
      stop: async () => {},
    };
    const registry = createRegistry();

    registerBuiltins(registry, sandbox, []);

    expect(registry.list()).toEqual([
      "read",
      "grep",
      "write",
      "edit",
      "bash",
      "askUser",
      "todo",
      "task",
      "loadSkill",
    ]);
  });

  test("registers and lists a custom tool", async () => {
    const registry = createRegistry();
    const now = tool({
      description: "Return a fixed timestamp",
      inputSchema: z.object({}),
      execute: async () => "2026-08-28T00:00:00.000Z",
    });

    registry.register("now", now);

    expect(registry.list()).toEqual(["now"]);
    expect(registry.entries()).toEqual([["now", now]]);
    expect(await registry.get("now")?.execute?.({}, executionOptions)).toBe(
      "2026-08-28T00:00:00.000Z",
    );
  });

  test("wraps execution without changing the base tool", async () => {
    const base = tool({
      inputSchema: z.object({ value: z.number() }),
      execute: async ({ value }) => value + 1,
    });
    const wrapped = wrapTool(base, {
      beforeExecute: ({ value }) => ({ value: value * 2 }),
      afterExecute: (result) => result * 10,
    });

    expect(await base.execute?.({ value: 2 }, executionOptions)).toBe(3);
    expect(await wrapped.execute?.({ value: 2 }, executionOptions)).toBe(50);
  });
});
