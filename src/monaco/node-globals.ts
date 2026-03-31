const nodeGlobals = `
declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
  cwd: () => string;
};

declare module "path" {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string): string;
  export function extname(path: string): string;
}

declare module "fs" {
  export type PathLike = string;
  export function readFileSync(path: PathLike, encoding?: string): string;
}

declare module "os" {
  export function homedir(): string;
  export function tmpdir(): string;
}
`;

export default nodeGlobals;
