import { describe, expect, test } from "bun:test";
import { createApproval } from "../index";

describe("createApproval", () => {
  test("interactive mode allows safe commands and blocks other input", () => {
    const needsApproval = createApproval({ mode: "interactive" });

    expect(needsApproval({ command: "git status" })).toBe(false);
    expect(needsApproval({ command: "npm install" })).toBe(true);
    expect(needsApproval({ command: "ls; rm -rf ." })).toBe(true);
  });

  test("background mode approves every command", () => {
    const needsApproval = createApproval({ mode: "background" });

    expect(needsApproval({ command: "npm install" })).toBe(false);
  });

  test("delegated mode only allows the delegated trust slice", () => {
    const needsApproval = createApproval({
      mode: "delegated",
      trust: ["npm test", "git status"],
    });

    expect(needsApproval({ command: "npm test -- --watch=false" })).toBe(false);
    expect(needsApproval({ command: "git status" })).toBe(false);
    expect(needsApproval({ command: "npm install" })).toBe(true);
  });
});
