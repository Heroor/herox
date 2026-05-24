export type CheckStatus = "ok" | "warn" | "error";

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface DoctorReport {
  title: string;
  checks: DoctorCheck[];
}

export interface CliIo {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

export function createTextBlock(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}
