import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalSandbox } from "../src/sandbox-local";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("createLocalSandbox", () => {
  test("reads files relative to its working directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "teensycode-local-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "hello.txt"), "hello");

    const sandbox = createLocalSandbox(directory);

    expect(await sandbox.readFile("hello.txt")).toBe("hello");
    expect(sandbox.type).toBe("local");
  });

  test("rejects reads outside its working directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "teensycode-local-"));
    temporaryDirectories.push(directory);
    const sandbox = createLocalSandbox(directory);

    expect(sandbox.readFile("../outside.txt")).rejects.toThrow(
      "Path is outside the working directory",
    );
  });

  test("returns non-zero command results instead of throwing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "teensycode-local-"));
    temporaryDirectories.push(directory);
    const sandbox = createLocalSandbox(directory);

    const result = await sandbox.exec("exit 7");

    expect(result.exitCode).toBe(7);
  });
});
