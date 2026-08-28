import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sandbox } from "../src/sandbox";
import { createJustBashSandbox } from "../src/sandbox-just-bash";

const temporaryDirectories: string[] = [];
const sandboxes: Sandbox[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.stop()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("createJustBashSandbox", () => {
  test("reads the overlay root through the virtual mount", async () => {
    const directory = await mkdtemp(join(tmpdir(), "teensycode-memory-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "hello.txt"), "hello");
    const sandbox = await createJustBashSandbox(directory);
    sandboxes.push(sandbox);

    expect(await sandbox.readFile("hello.txt")).toBe("hello");
    expect(sandbox.type).toBe("just-bash");
  });

  test("keeps command writes out of the real filesystem", async () => {
    const directory = await mkdtemp(join(tmpdir(), "teensycode-memory-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "state.txt"), "original\n");
    const sandbox = await createJustBashSandbox(directory);
    sandboxes.push(sandbox);

    const result = await sandbox.exec("echo changed > state.txt");

    expect(result.exitCode).toBe(0);
    expect(await sandbox.readFile("state.txt")).toBe("changed\n");
    expect(await readFile(join(directory, "state.txt"), "utf8")).toBe("original\n");
  });

  test("keeps direct writes in the overlay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "teensycode-memory-"));
    temporaryDirectories.push(directory);
    const sandbox = await createJustBashSandbox(directory);
    sandboxes.push(sandbox);

    await sandbox.writeFile("created.txt", "created");

    expect(await sandbox.readFile("created.txt")).toBe("created");
    expect(readFile(join(directory, "created.txt"), "utf8")).rejects.toThrow();
  });
});
