import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";

export class CodexProcess extends EventEmitter<{
  error: [error: Error];
  exit: [code: number | null];
  message: [message: unknown];
  stderr: [chunk: string];
}> {
  private readonly proc: ChildProcessWithoutNullStreams;

  constructor(codexBin = "codex") {
    super();
    const resolvedCodexBin = resolveCodexBinary(codexBin);
    
    // On Windows, .cmd and .bat files need to be run through cmd.exe
    const isWindowsScript = process.platform === "win32" && 
      (resolvedCodexBin.endsWith(".cmd") || resolvedCodexBin.endsWith(".bat"));
    
    const spawnCommand = isWindowsScript ? "cmd.exe" : resolvedCodexBin;
    const spawnArgs = isWindowsScript 
      ? ["/c", resolvedCodexBin, "app-server"]
      : ["app-server"];
    
    console.log("[CodexDebug][Process] spawning", {
      codexBin,
      platform: process.platform,
      resolvedCodexBin,
      spawnCommand,
      spawnArgs,
    });

    this.proc = spawn(spawnCommand, spawnArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    console.log("[CodexDebug][Process] spawned", {
      pid: this.proc.pid,
      resolvedCodexBin,
    });

    const rl = createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      try {
        this.emit("message", JSON.parse(trimmed));
      } catch (error) {
        console.error("[CodexDebug][Process] invalid JSON from codex", {
          error: String(error),
          trimmed,
        });
        this.emit(
          "stderr",
          `[CodexProcess] Failed to parse JSON: ${String(error)}\n${trimmed}`
        );
      }
    });

    this.proc.stderr.on("data", (chunk) => {
      console.log("[CodexDebug][Process][stderr]", chunk.toString());
      this.emit("stderr", chunk.toString());
    });

    this.proc.on("error", (error) => {
      const spawnError = error as NodeJS.ErrnoException;
      const message =
        spawnError.code === "ENOENT"
          ? `Unable to start Codex. Tried executable: ${resolvedCodexBin}`
          : error.message;
      console.error("[CodexDebug][Process] spawn error", {
        code: spawnError.code,
        message,
        resolvedCodexBin,
      });
      this.emit("error", new Error(message));
    });

    this.proc.on("exit", (code) => {
      console.log("[CodexDebug][Process] exit", { code, pid: this.proc.pid });
      this.emit("exit", code);
    });
  }

  kill() {
    if (!this.proc.killed) {
      this.proc.kill();
    }
  }

  send(message: unknown) {
    console.log("[CodexDebug][Process] send", message);
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

function resolveCodexBinary(codexBin: string) {
  if (path.isAbsolute(codexBin) && existsSync(codexBin)) {
    return codexBin;
  }

  const candidates = [
    process.env.CODEX_BIN,
    // On Windows, prioritize .cmd wrappers from npm before other candidates
    ...getWindowsNpmCandidates(),
    ...getPathCandidates(codexBin),
    codexBin,
    process.platform === "win32" ? `${codexBin}.cmd` : "",
    process.platform === "win32" ? `${codexBin}.exe` : "",
  ].filter(Boolean) as string[];

  const resolved = candidates.find((candidate) => existsSync(candidate));
  console.log("[CodexDebug][Process] binary resolution", {
    candidates: candidates.slice(0, 5),
    resolved,
  });
  
  return resolved ?? codexBin;
}

function getPathCandidates(codexBin: string) {
  const pathValue = process.env.PATH ?? "";
  if (!pathValue) {
    return [];
  }

  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT?.split(";").filter(Boolean) ?? [
          ".COM",
          ".EXE",
          ".BAT",
          ".CMD",
        ])
      : [""];

  return pathValue
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((dir) => {
      if (process.platform !== "win32") {
        return [path.join(dir, codexBin)];
      }

      return [
        path.join(dir, codexBin),
        ...extensions.map((extension) =>
          path.join(dir, `${codexBin}${extension.toLowerCase()}`)
        ),
      ];
    });
}

function getWindowsNpmCandidates() {
  if (process.platform !== "win32") {
    return [];
  }

  const roamingNpm = process.env.APPDATA
    ? path.join(process.env.APPDATA, "npm")
    : "";

  return roamingNpm
    ? [
        path.join(roamingNpm, "codex.cmd"),
        path.join(roamingNpm, "codex.exe"),
        path.join(roamingNpm, "codex"),
      ]
    : [];
}
