import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "../src/system";

describe("buildSystemPrompt", () => {
  test("includes runtime context and available tools", () => {
    const prompt = buildSystemPrompt({
      workingDirectory: "/project",
      sandboxType: "local",
      toolNames: ["read", "grep"],
      gitBranch: "feature/test",
    });

    expect(prompt).toContain("working in: /project");
    expect(prompt).toContain("Sandbox: local");
    expect(prompt).toContain("Available tools: read, grep");
    expect(prompt).toContain("Current branch: feature/test");
    expect(prompt).toContain("# Verification");
    expect(prompt).toContain("Do NOT claim that tests pass without running them");
  });

  test("omits optional sections when context is absent", () => {
    const prompt = buildSystemPrompt({
      workingDirectory: "/project",
      sandboxType: "local",
      toolNames: [],
    });

    expect(prompt).not.toContain("Current branch:");
    expect(prompt).not.toContain("Project Instructions");
  });
});
