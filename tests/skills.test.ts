import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSkills } from "../src/skills";
import { createLoadSkillTool } from "../src/tools";

const temporaryDirectories: string[] = [];

function createSkillDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "teensycode-skills-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeSkill(
  directory: string,
  folder: string,
  frontmatter: string,
  body = "# Instructions",
) {
  const skillDirectory = join(directory, folder);
  mkdirSync(skillDirectory, { recursive: true });
  writeFileSync(join(skillDirectory, "SKILL.md"), `---\n${frontmatter}\n---\n${body}`);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("skills", () => {
  test("discovers frontmatter and lets the first directory override later ones", () => {
    const project = createSkillDirectory();
    const global = createSkillDirectory();
    writeSkill(project, "auth", "description: Project auth rules");
    writeSkill(global, "auth", "description: Global auth rules");
    writeSkill(global, "database", "name: db\ndescription: Database rules");

    const skills = discoverSkills([project, global]);

    expect(skills.map(({ name, description }) => ({ name, description }))).toEqual([
      { name: "auth", description: "Project auth rules" },
      { name: "db", description: "Database rules" },
    ]);
  });

  test("loads content on demand and caps large skills", async () => {
    const directory = createSkillDirectory();
    writeSkill(directory, "large", "description: Large skill", "x".repeat(4_100));
    const tool = createLoadSkillTool(discoverSkills([directory]));

    const output = await tool.execute?.(
      { name: "large" },
      { toolCallId: "test", messages: [] },
    );

    expect(output).toContain("truncated at 4000 chars");
  });
});
