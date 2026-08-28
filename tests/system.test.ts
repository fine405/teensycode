import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "../src/system";

describe("buildSystemPrompt", () => {
  test("includes runtime context and available tools", () => {
    const prompt = buildSystemPrompt({
      workingDirectory: "/project",
      sandboxType: "local",
      toolNames: ["read", "grep"],
      gitBranch: "feature/test",
      verificationCommands: ["npm run typecheck", "npm test"],
      skills: [{ name: "auth", description: "Project authentication rules" }],
    });

    expect(prompt).toContain("working in: /project");
    expect(prompt).toContain("Sandbox: local");
    expect(prompt).toContain("Available tools: read, grep");
    expect(prompt).toContain("Current branch: feature/test");
    expect(prompt).toContain("# Verification");
    expect(prompt).toContain("Do NOT claim that tests pass without running them");
    expect(prompt).toContain("# Handling Ambiguity");
    expect(prompt).toContain("Use askUser to let the user choose");
    expect(prompt).toContain("Search before reading");
    expect(prompt).toContain("1. `npm run typecheck`");
    expect(prompt).toContain("2. `npm test`");
    expect(prompt).toContain("failures caused by your changes");
    expect(prompt).toContain("# Skills");
    expect(prompt).toContain("- auth: Project authentication rules");
  });

  test("omits optional sections when context is absent", () => {
    const prompt = buildSystemPrompt({
      workingDirectory: "/project",
      sandboxType: "local",
      toolNames: [],
    });

    expect(prompt).not.toContain("Current branch:");
    expect(prompt).not.toContain("Project Instructions");
    expect(prompt).not.toContain("# Skills");
  });

  test("injects project instructions when provided", () => {
    const prompt = buildSystemPrompt({
      workingDirectory: "/project",
      sandboxType: "local",
      toolNames: [],
      projectContext: "Run npm test before committing.",
    });

    expect(prompt).toContain("# Project Instructions (from AGENTS.md)");
    expect(prompt).toContain("Run npm test before committing.");
  });
});
