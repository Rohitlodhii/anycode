import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

export type FileNode = {
  name: string;
  path: string;
  parentPath: string | null;
  relativePath: string;
  type: "file" | "folder";
  children?: FileNode[];
};

const MAX_DEPTH = 5;

export async function buildFileTree(rootPath: string): Promise<FileNode> {
  const rootName = path.basename(rootPath);
  const children = await readDirectoryRecursive(rootPath, rootPath, 0);

  return {
    name: rootName || rootPath,
    path: rootPath,
    parentPath: null,
    relativePath: "",
    type: "folder",
    children,
  };
}

async function readDirectoryRecursive(
  rootPath: string,
  currentPath: string,
  depth: number
): Promise<FileNode[]> {
  if (depth > MAX_DEPTH) {
    return [];
  }

  let entries: fs.Dirent<string>[];
  try {
    entries = await fsPromises.readdir(currentPath, {
      encoding: "utf8",
      withFileTypes: true,
    });
  } catch (error) {
    console.warn(`Failed to read directory: ${currentPath}`, error);
    return [];
  }
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    if (entry.isDirectory()) {
      const children =
        depth < MAX_DEPTH
          ? await readDirectoryRecursive(rootPath, fullPath, depth + 1)
          : [];

      nodes.push({
        name: entry.name,
        path: fullPath,
        parentPath: currentPath,
        relativePath,
        type: "folder",
        children,
      });
    } else {
      nodes.push({
        name: entry.name,
        path: fullPath,
        parentPath: currentPath,
        relativePath,
        type: "file",
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export function buildFileTreeSync(rootPath: string): FileNode {
  const rootName = path.basename(rootPath);
  const children = readDirectoryRecursiveSync(rootPath, rootPath, 0);

  return {
    name: rootName || rootPath,
    path: rootPath,
    parentPath: null,
    relativePath: "",
    type: "folder",
    children,
  };
}

function readDirectoryRecursiveSync(
  rootPath: string,
  currentPath: string,
  depth: number
): FileNode[] {
  if (depth > MAX_DEPTH) {
    return [];
  }

  let entries: fs.Dirent<string>[];
  try {
    entries = fs.readdirSync(currentPath, {
      encoding: "utf8",
      withFileTypes: true,
    });
  } catch (error) {
    console.warn(`Failed to read directory: ${currentPath}`, error);
    return [];
  }

  const nodes: FileNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    if (entry.isDirectory()) {
      const children =
        depth < MAX_DEPTH
          ? readDirectoryRecursiveSync(rootPath, fullPath, depth + 1)
          : [];

      nodes.push({
        name: entry.name,
        path: fullPath,
        parentPath: currentPath,
        relativePath,
        type: "folder",
        children,
      });
    } else {
      nodes.push({
        name: entry.name,
        path: fullPath,
        parentPath: currentPath,
        relativePath,
        type: "file",
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}
