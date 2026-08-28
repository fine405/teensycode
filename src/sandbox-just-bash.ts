import { Sandbox as JustBashSandbox } from "just-bash";
import { isAbsolute, normalize, resolve } from "node:path";
import type { Sandbox } from "./sandbox";

const mount = "/home/user/project";

function virtualPath(path: string): string {
  const normalized = normalize(path);
  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Path is outside the working directory: ${path}`);
  }
  return `${mount}/${normalized}`;
}

export async function createJustBashSandbox(directory: string): Promise<Sandbox> {
  const root = resolve(directory);
  const justBash = await JustBashSandbox.create({
    overlayRoot: root,
    cwd: mount,
    // Bun does not expose the Node module hooks required by this extra patch layer.
    defenseInDepth: false,
  });

  return {
    type: "just-bash",
    workingDirectory: root,
    readFile: async (path) => justBash.readFile(virtualPath(path)),
    exec: async (command) => {
      const result = await justBash.runCommand(command, { cwd: mount });
      return {
        stdout: await result.output(),
        exitCode: result.exitCode,
      };
    },
    stop: async () => justBash.stop(),
  };
}
