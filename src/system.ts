export interface PromptContext {
  workingDirectory: string;
  sandboxType: string;
  toolNames: string[];
  gitBranch?: string;
  projectContext?: string;
  verificationCommands?: string[];
  skills?: { name: string; description: string }[];
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
- Search before reading. Use grep first, then read only what you will change.
- Do not read files "just in case." Read what you need when you need it.
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

  if (context.skills?.length) {
    const skills = context.skills
      .map((skill) => `- ${skill.name}: ${skill.description}`)
      .join("\n");
    sections.push(`
# Skills
The following skills are available. Call loadSkill with the name to get full content.
${skills}`);
  }

  const verificationGates = context.verificationCommands?.length
    ? context.verificationCommands
        .map((command, index) => `${index + 1}. \`${command}\``)
        .join("\n")
    : "(no verification commands discovered for this project)";

  sections.push(`
# Verification
After making changes, run these project gates in order:
${verificationGates}

Report exactly what ran, what passed, what failed, what was blocked, and what
was unavailable. Distinguish failures caused by your changes from failures
that were already present.

Do NOT claim that tests pass without running them. Do not inflate partial
verification into a blanket success claim.`);

  sections.push(`
# Handling Ambiguity
When a task is ambiguous or has multiple valid approaches:
1. Search the code and project instructions to gather context first.
2. Use askUser to let the user choose when important ambiguity remains. Do not guess.
3. Act only after the missing decision is resolved.

Examples: "add authentication" needs an authentication-strategy choice;
"set up a database" needs a database choice. Specific tasks with precise file
paths, locations, or instructions should proceed directly.`);

  if (context.projectContext) {
    sections.push(`
# Project Instructions (from AGENTS.md)
${context.projectContext}`);
  }

  return sections.join("\n");
}
