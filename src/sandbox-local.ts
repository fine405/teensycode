import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { Sandbox } from "./sandbox";

const execAsync = promisify(exec);

export function createLocalSandbox(directory: string): Sandbox {
  const root = resolve(directory);

  function resolvePath(path: string): string {
    const absolutePath = resolve(root, path);
    const relativePath = relative(root, absolutePath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error(`Path is outside the working directory: ${path}`);
    }
    return absolutePath;
  }

  return {
    type: "local",
    workingDirectory: root,
    readFile: async (path) => readFile(resolvePath(path), "utf8"),
    exec: async (command) => {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: root,
          encoding: "utf8",
          timeout: 30_000,
        });
        return { stdout: stdout || stderr, exitCode: 0 };
      } catch (error) {
        const result = error as Error & {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        return {
          stdout: result.stdout || result.stderr || result.message,
          exitCode: result.code ?? 1,
        };
      }
    },
    stop: async () => {},
  };
}
