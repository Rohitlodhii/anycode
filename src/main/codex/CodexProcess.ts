import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import { logger } from "@/utils/logger";

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
    
    logger.debug("[Codex][Process] spawning", {
      platform: process.platform,
      resolvedCodexBin,
      spawnCommand,
      spawnArgs,
    });

    this.proc = spawn(spawnCommand, spawnArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    logger.debug("[Codex][Process] spawned", {
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
        logger.error("[Codex][Process] invalid JSON from codex", {
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
      // Stderr is surfaced to the UI via events; do not log verbosely.
      logger.debug("[Codex][Process][stderr]", chunk.toString());
      this.emit("stderr", chunk.toString());
    });
    this.proc.stdin.on("error", (error) => {
      logger.error("[Codex][Process] stdin error", { error: String(error) });
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    });

    this.proc.on("error", (error) => {
      const spawnError = error as NodeJS.ErrnoException;
      const message =
        spawnError.code === "ENOENT"
          ? `Unable to start Codex. Tried executable: ${resolvedCodexBin}`
          : error.message;
      logger.error("[Codex][Process] spawn error", {
        code: spawnError.code,
        message,
        resolvedCodexBin,
      });
      this.emit("error", new Error(message));
    });

    this.proc.on("exit", (code) => {
      logger.debug("[Codex][Process] exit", { code, pid: this.proc.pid });
      this.emit("exit", code);
    });
  }

  kill() {
    if (!this.proc.killed) {
      this.proc.kill();
    }
  }

  send(message: unknown) {
    logger.debug("[Codex][Process] send");
    if (!this.proc.stdin.writable || this.proc.stdin.destroyed) {
      this.emit("error", new Error("Cannot send to Codex process: stdin is not writable"));
      return;
    }
    try {
      this.proc.stdin.write(`${JSON.stringify(message)}\n`);
    } catch (error) {
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
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
  logger.debug("[Codex][Process] binary resolution", {
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
