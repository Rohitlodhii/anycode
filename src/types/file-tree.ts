export type FileNode = {
  name: string;
  path: string;
  parentPath: string | null;
  relativePath: string;
  type: "file" | "folder";
  children?: FileNode[];
};
