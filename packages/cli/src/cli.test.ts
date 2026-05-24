import { describe, expect, it } from "vitest";

import { runCli } from "./cli.js";

describe("runCli", () => {
  it("prints help", async () => {
    const output: string[] = [];
    const code = await runCli(["--help"], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    });

    expect(code).toBe(0);
    expect(output.join("")).toContain("Usage: herox");
  });

  it("prints version", async () => {
    const output: string[] = [];
    const code = await runCli(["--version"], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    });

    expect(code).toBe(0);
    expect(output.join("")).toContain("0.1.0");
  });

  it("runs doctor", async () => {
    const output: string[] = [];
    const code = await runCli(["doctor"], {
      stdout: { write: (chunk) => append(output, chunk) },
      stderr: { write: (chunk) => append(output, chunk) },
    });

    expect(code).toBe(0);
    expect(output.join("")).toContain("Herox doctor");
  });
});

function append(output: string[], chunk: string | Uint8Array): boolean {
  output.push(String(chunk));
  return true;
}
