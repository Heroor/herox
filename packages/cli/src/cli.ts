import { buildDoctorReport, formatDoctorReport } from "@heroor/x-core";
import type { CliIo } from "@heroor/x-shared";
import { createTextBlock } from "@heroor/x-shared";
import { readFileSync } from "node:fs";

const helpText = createTextBlock([
  "Herox Agent CLI",
  "",
  "Usage: herox [command] [options]",
  "",
  "Commands:",
  "  doctor             Check local Herox runtime readiness",
  "  run <task>         Execute a one-shot task (coming soon)",
  "  init               Initialize project Herox files (coming soon)",
  "  resume [session]   Resume a saved session (coming soon)",
  "",
  "Options:",
  "  -h, --help         Show help",
  "  -v, --version      Show version",
]);

export async function runCli(
  args: string[] = process.argv.slice(2),
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const [command] = normalizeArgs(args);

  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    io.stdout.write(helpText);
    return 0;
  }

  if (command === "-v" || command === "--version" || command === "version") {
    io.stdout.write(`${readPackageVersion()}\n`);
    return 0;
  }

  if (command === "doctor") {
    const report = buildDoctorReport({
      cwd: process.cwd(),
      version: readPackageVersion(),
    });
    io.stdout.write(formatDoctorReport(report));
    return hasDoctorErrors(report.checks) ? 1 : 0;
  }

  if (command === "run" || command === "init" || command === "resume") {
    io.stderr.write(`herox ${command} is not implemented yet.\n`);
    return 2;
  }

  io.stderr.write(`Unknown command: ${command}\n\n`);
  io.stderr.write(helpText);
  return 1;
}

function normalizeArgs(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args;
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function hasDoctorErrors(checks: Array<{ status: string }>): boolean {
  return checks.some((check) => check.status === "error");
}
