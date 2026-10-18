import { readFile, stat } from "node:fs/promises";
import { inside } from "./security";
import type { ProjectCommands } from "../../shared/types";

export async function projectCommands(root: string): Promise<ProjectCommands> {
  const read = async (file: string) => {
    try {
      const target = await inside(root, file);
      if ((await stat(target)).size > 64000) return undefined;
      return await readFile(target, "utf8");
    } catch {
      return undefined;
    }
  };
  const has = async (file: string) => {
    try {
      return (await stat(await inside(root, file))).isFile();
    } catch {
      return false;
    }
  };
  const note =
    "Detected from project files; scripts execute project code. Review commands before running them in the terminal or approving a plan.";
  const manifest = await read("package.json");
  if (manifest) {
    try {
      const data = JSON.parse(manifest);
      const manager = (await has("pnpm-lock.yaml"))
        ? "pnpm"
        : (await has("yarn.lock"))
          ? "yarn"
          : "npm";
      const commands: ProjectCommands["commands"] = [];
      for (const [name, purpose] of [
        ["dev", "run"],
        ["start", "run"],
        ["build", "build"],
        ["test", "test"],
        ["test:e2e", "test"],
        ["test:features", "test"],
        ["typecheck", "test"],
        ["lint", "test"],
      ] as const) {
        if (
          Object.hasOwn(data.scripts ?? {}, name) &&
          typeof data.scripts[name] === "string"
        )
          commands.push({
            label: name,
            command: `${manager} run ${name}`,
            purpose,
          });
      }
      return { ecosystem: "JavaScript / TypeScript", commands, note };
    } catch {
      return {
        ecosystem: "Invalid package.json",
        commands: [],
        note: "Fix package.json before detecting commands.",
      };
    }
  }
  for (const [file, ecosystem, commands] of [
    [
      "Cargo.toml",
      "Rust",
      [
        ["Run", "cargo run", "run"],
        ["Build", "cargo build", "build"],
        ["Test", "cargo test", "test"],
      ],
    ],
    [
      "go.mod",
      "Go",
      [
        ["Build", "go build ./...", "build"],
        ["Test", "go test ./...", "test"],
      ],
    ],
    [
      "pyproject.toml",
      "Python",
      [["Test", "python3 -m unittest discover", "test"]],
    ],
    [
      "Package.swift",
      "Swift",
      [
        ["Run", "swift run", "run"],
        ["Build", "swift build", "build"],
        ["Test", "swift test", "test"],
      ],
    ],
    [
      "pom.xml",
      "Maven",
      [
        ["Build", "mvn package", "build"],
        ["Test", "mvn test", "test"],
      ],
    ],
  ] as const) {
    if ((await read(file)) !== undefined)
      return {
        ecosystem,
        commands: commands.map(([label, command, purpose]) => ({
          label,
          command,
          purpose,
        })),
        note,
      };
  }
  return {
    ecosystem: "Not detected",
    commands: [],
    note: "No supported manifest found. Ask Ava to inspect the project and identify the correct commands.",
  };
}
