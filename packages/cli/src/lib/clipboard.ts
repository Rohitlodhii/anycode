import { execFile, spawn } from "node:child_process";

function getClipboardCommand(): { cmd: string; args: string[] } {
    switch (process.platform) {
        case "win32":
            return {
                cmd: "powershell.exe",
                args: [
                    "-NoProfile",
                    "-Command",
                    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw"
                ]
            };
        case "darwin":
            return { cmd: "pbpaste", args: [] };
        default:
            return { cmd: "wl-paste", args: ["-n"] };
    }
}

function getSetClipboardCommand(): { cmd: string; args: string[] } {
    switch (process.platform) {
        case "win32":
            return {
                cmd: "powershell.exe",
                args: [
                    "-NoProfile",
                    "-Command",
                    "[Console]::InputEncoding=[System.Text.Encoding]::UTF8; $input | Set-Clipboard"
                ]
            };
        case "darwin":
            return { cmd: "pbcopy", args: [] };
        default:
            return { cmd: "wl-copy", args: [] };
    }
}

export function getClipboardText(): Promise<string> {
    return new Promise((resolve) => {
        const { cmd, args } = getClipboardCommand();
        execFile(cmd, args, { timeout: 2000, encoding: "utf8" }, (error, stdout) => {
            if (error) {
                resolve("");
                return;
            }
            resolve(stdout);
        });
    });
}

export function setClipboardText(text: string): Promise<void> {
    return new Promise((resolve) => {
        const { cmd, args } = getSetClipboardCommand();
        const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
        child.stdin.write(text);
        child.stdin.end();
        child.on("close", () => resolve());
        child.on("error", () => resolve());
    });
}
