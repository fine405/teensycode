import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface Skill {
  name: string;
  description: string;
  path: string;
}

function parseFrontmatter(markdown: string): {
  name?: string;
  description?: string;
} {
  if (!markdown.startsWith("---")) return {};

  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return {};

  const fields = Object.fromEntries(
    markdown
      .slice(3, end)
      .split("\n")
      .map((line) => line.match(/^([^:]+):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [
        match[1].trim(),
        match[2].trim().replace(/^['"]|['"]$/g, ""),
      ]),
  );

  return {
    name: fields.name,
    description: fields.description,
  };
}

export function discoverSkills(directories: string[]): Skill[] {
  const skills: Skill[] = [];
  const seen = new Set<string>();

  for (const directory of directories) {
    if (!existsSync(directory)) continue;

    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry, "SKILL.md");
      if (!existsSync(path)) continue;

      const content = readFileSync(path, "utf8");
      const frontmatter = parseFrontmatter(content);
      const name = frontmatter.name ?? entry;
      if (seen.has(name)) continue;

      seen.add(name);
      skills.push({
        name,
        description: frontmatter.description ?? "(no description)",
        path,
      });
    }
  }

  return skills;
}
