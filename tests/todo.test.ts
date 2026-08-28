import { describe, expect, test } from "bun:test";
import { createTodoManager } from "../src/tools";

function idFrom(result: string): string {
  const match = result.match(/\[([^\]]+)\]/);
  if (!match) throw new Error(`No todo id in: ${result}`);
  return match[1];
}

describe("todo manager", () => {
  test("allows only one in-progress item", () => {
    const manager = createTodoManager();
    const first = idFrom(manager.run({ action: "add", description: "first" }));
    const second = idFrom(manager.run({ action: "add", description: "second" }));

    expect(manager.run({ action: "start", id: first })).toContain("Started");
    expect(manager.run({ action: "start", id: second })).toContain(
      "Already working on",
    );
    expect(manager.run({ action: "complete", id: first })).toContain("Completed");
    expect(manager.run({ action: "start", id: second })).toContain("Started");
  });

  test("lists item state", () => {
    const manager = createTodoManager();
    manager.run({ action: "add", description: "inspect state" });

    expect(manager.run({ action: "list" })).toContain("[pending]");
  });
});
