import { execute, type ProcessOptions, type ProcessResult } from "./process";

type Architecture = "-arm64" | "-x86_64";
export function graphifyArchitecture(
  stderr: string,
  platform = process.platform,
): Architecture | undefined {
  if (platform !== "darwin" || !stderr.includes("incompatible architecture"))
    return;
  if (/have ['"]arm64['"], need ['"]x86_64['"]/.test(stderr)) return "-arm64";
  if (/have ['"]x86_64['"], need ['"]arm64['"]/.test(stderr)) return "-x86_64";
}

export function graphifyFailure(stderr: string) {
  if (stderr.includes("incompatible architecture"))
    return "Graphify’s Python interpreter and parser library use different CPU architectures. Reinstall Graphify with a matching native Python interpreter, then choose Refresh graph.";
  return "Graphify extraction failed: " + stderr.slice(-1000);
}

export class GraphifyRuntime {
  private preferred?: { binary: string; architecture: Architecture };
  constructor(private platform = process.platform) {}
  async run(
    binary: string,
    args: string[],
    options: ProcessOptions,
  ): Promise<ProcessResult> {
    const preferred =
      this.preferred?.binary === binary
        ? this.preferred.architecture
        : undefined;
    const launch = (architecture?: Architecture) =>
      execute(
        architecture ? "/usr/bin/arch" : binary,
        architecture ? [architecture, binary, ...args] : args,
        options,
      );
    const result = await launch(preferred);
    if (result.code === 0) return result;
    const architecture = graphifyArchitecture(result.stderr, this.platform);
    if (!architecture || architecture === preferred) return result;
    const recovered = await launch(architecture);
    if (recovered.code === 0) this.preferred = { binary, architecture };
    return recovered;
  }
}
