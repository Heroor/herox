import { listProviderPresets } from "@heroor/x-providers";
import type { DoctorCheck, DoctorReport } from "@heroor/x-shared";
import { createTextBlock } from "@heroor/x-shared";
import { listBuiltinTools } from "@heroor/x-tools";

export interface BuildDoctorReportOptions {
  version: string;
  cwd?: string;
  nodeVersion?: string;
}

export function buildDoctorReport(options: BuildDoctorReportOptions): DoctorReport {
  const nodeVersion = options.nodeVersion ?? process.version;
  const nodeMajor = parseNodeMajor(nodeVersion);
  const providerCount = listProviderPresets().length;
  const toolCount = listBuiltinTools().length;

  const checks: DoctorCheck[] = [
    {
      name: "Node.js",
      status: nodeMajor >= 20 ? "ok" : "error",
      message:
        nodeMajor >= 20
          ? `${nodeVersion} satisfies >=20`
          : `${nodeVersion} is unsupported; Herox requires Node.js >=20`,
    },
    {
      name: "Package",
      status: "ok",
      message: `@heroor/x ${options.version}`,
    },
    {
      name: "Workspace",
      status: "ok",
      message: options.cwd ?? process.cwd(),
    },
    {
      name: "Provider presets",
      status: providerCount > 0 ? "ok" : "warn",
      message: `${providerCount} presets registered`,
    },
    {
      name: "Builtin tools",
      status: toolCount > 0 ? "ok" : "warn",
      message: `${toolCount} tools registered`,
    },
  ];

  return {
    title: "Herox doctor",
    checks,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    report.title,
    "",
    ...report.checks.map((check) => {
      const label = check.status.toUpperCase().padEnd(5, " ");
      return `${label} ${check.name}: ${check.message}`;
    }),
  ];

  return createTextBlock(lines);
}

function parseNodeMajor(version: string): number {
  // Node reports versions as "v20.11.1"; stripping the prefix keeps prerelease
  // and test inputs on the same simple code path.
  const [major] = version.replace(/^v/, "").split(".");
  const parsed = Number.parseInt(major ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
