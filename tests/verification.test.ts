import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalSandbox } from "../src/sandbox-local";
import { discoverVerificationCommands } from "../src/verification";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("discoverVerificationCommands", () => {
  test("returns configured gates in fast-to-slow order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "teensycode-verify-"));
    temporaryDirectories.push(directory);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        scripts: {
          build: "build",
          test: "test",
          lint: "lint",
          typecheck: "tsc --noEmit",
        },
      }),
    );

    const commands = await discoverVerificationCommands(
      createLocalSandbox(directory),
    );

    expect(commands).toEqual([
      "npm run typecheck",
      "npm run lint",
      "npm test",
      "npm run build",
    ]);
  });

  test("falls back to tsc when TypeScript is installed without a script", async () => {
    const directory = await mkdtemp(join(tmpdir(), "teensycode-verify-"));
    temporaryDirectories.push(directory);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "5.9.3" } }),
    );

    const commands = await discoverVerificationCommands(
      createLocalSandbox(directory),
    );

    expect(commands).toEqual(["npx tsc --noEmit"]);
  });

  test("returns no gates for an unreadable manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "teensycode-verify-"));
    temporaryDirectories.push(directory);

    expect(
      await discoverVerificationCommands(createLocalSandbox(directory)),
    ).toEqual([]);
  });
});
