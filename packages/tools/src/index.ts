export type ToolRisk = "read" | "write" | "execute" | "network" | "destructive"

export interface BuiltinTool {
  name: string
  description: string
  risk: ToolRisk
}

export const builtinTools: BuiltinTool[] = [
  {
    name: "fs.read",
    description: "Read a UTF-8 text file from the current workspace.",
    risk: "read",
  },
  {
    name: "fs.list",
    description: "List files and directories under a workspace path.",
    risk: "read",
  },
  {
    name: "fs.search",
    description: "Search workspace files with ripgrep-compatible semantics.",
    risk: "read",
  },
  {
    name: "fs.patch",
    description: "Apply a structured patch to workspace files.",
    risk: "write",
  },
  {
    name: "shell.exec",
    description: "Run a local shell command after permission checks.",
    risk: "execute",
  },
  {
    name: "git.status",
    description: "Inspect git working tree status.",
    risk: "read",
  },
  {
    name: "git.diff",
    description: "Inspect git diffs without changing repository state.",
    risk: "read",
  },
]

export function listBuiltinTools(): BuiltinTool[] {
  return [...builtinTools]
}
