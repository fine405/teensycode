export interface PromptContext {
  workingDirectory: string;
  sandboxType: string;
  toolNames: string[];
  gitBranch?: string;
  projectContext?: string;
}

export function buildSystemPrompt(context: PromptContext): string {
  const sections = [
    `You are a coding agent working in: ${context.workingDirectory}`,
    `Sandbox: ${context.sandboxType}`,
    `
# Agency
- USE your tools. Read files, search code, run commands, then answer.
- Do NOT explain what you would do. Actually complete the task.
- Prefer grep for searching and read for viewing known files.
- Use bash only for commands that are not covered by another tool.
- Available tools: ${context.toolNames.join(", ")}`,
  ];

  if (context.gitBranch) {
    sections.push(`- Current branch: ${context.gitBranch}`);
  }

  sections.push(`
# Guardrails
- Prefer simple, minimal changes.
- Search before creating and reuse existing patterns.
- Do not add dependencies without asking.`);

  sections.push(`
# Verification
After making changes, verify your work:
1. Run \`npm run typecheck\` when TypeScript is present.
2. Run lint, test, or build commands only when they exist in the project and
   are allowed by the current approval mode.
3. Report exactly what ran, what was blocked, and what was unavailable.
4. Do not inflate partial verification into a blanket success claim.

Do NOT claim that tests pass without running them. Scope every verification
claim to the checks that actually ran.`);

  if (context.projectContext) {
    sections.push(`
# Project Instructions (from AGENTS.md)
${context.projectContext}`);
  }

  return sections.join("\n");
}
