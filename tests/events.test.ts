import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { z } from "zod";
import { createEventBus, wrapToolWithEvents } from "../src/events";

const executionOptions = { toolCallId: "test", messages: [] };

describe("event bus", () => {
  test("passes modifications to later handlers in registration order", async () => {
    const events = createEventBus();
    const observations: string[] = [];
    events.on("tool_call", async (data) => {
      observations.push(`first:${data.input.path}`);
      return { modify: { input: { ...data.input, path: "safe.txt" } } };
    });
    events.on("tool_call", async (data) => {
      observations.push(`second:${data.input.path}`);
    });

    const emission = await events.emit("tool_call", {
      toolName: "write",
      input: { path: ".env" },
    });

    expect(observations).toEqual(["first:.env", "second:safe.txt"]);
    expect(emission.data.input.path).toBe("safe.txt");
    expect(emission.blocked).toBe(false);
  });

  test("stops at the first blocking handler", async () => {
    const events = createEventBus();
    const observations: string[] = [];
    events.on("tool_call", async () => {
      observations.push("logger");
    });
    events.on("tool_call", async () => ({
      block: true,
      reason: "Protected file.",
    }));
    events.on("tool_call", async () => {
      observations.push("too-late");
    });

    const emission = await events.emit("tool_call", {
      toolName: "write",
      input: { path: ".env" },
    });

    expect(observations).toEqual(["logger"]);
    expect(emission.blocked).toBe(true);
    expect(emission.reason).toBe("Protected file.");
  });

  test("wraps tool calls and results with the event chain", async () => {
    const events = createEventBus();
    let executions = 0;
    const base = tool({
      inputSchema: z.object({ value: z.number() }),
      execute: async ({ value }) => {
        executions += 1;
        return value + 1;
      },
    });
    events.on("tool_call", async ({ input }) => ({
      modify: { input: { value: input.value * 2 } },
    }));
    events.on("tool_result", async ({ result }) => ({
      modify: { result: result * 10 },
    }));
    const wrapped = wrapToolWithEvents("calculate", base, events);

    expect(await wrapped.execute?.({ value: 2 }, executionOptions)).toBe(50);
    expect(executions).toBe(1);

    events.on("tool_call", async () => ({ block: true, reason: "Stopped." }));
    expect(await wrapped.execute?.({ value: 2 }, executionOptions)).toBe(
      "Blocked: Stopped.",
    );
    expect(executions).toBe(1);
  });
});
