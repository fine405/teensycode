import type { Sandbox } from "./sandbox";

interface PackageManifest {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function discoverVerificationCommands(
  sandbox: Sandbox,
): Promise<string[]> {
  try {
    const manifest = JSON.parse(
      await sandbox.readFile("package.json"),
    ) as PackageManifest;
    const scripts = manifest.scripts ?? {};
    const commands: string[] = [];

    if (scripts.typecheck) commands.push("npm run typecheck");
    else if (scripts["type-check"]) commands.push("npm run type-check");
    else if (manifest.devDependencies?.typescript || manifest.dependencies?.typescript) {
      commands.push("npx tsc --noEmit");
    }

    if (scripts.lint) commands.push("npm run lint");
    if (scripts.test) commands.push("npm test");
    if (scripts.build) commands.push("npm run build");

    return commands;
  } catch {
    return [];
  }
}
