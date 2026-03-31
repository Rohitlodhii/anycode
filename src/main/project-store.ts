import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { RecentProject } from "@/types/project-history";

type ProjectHistoryState = {
  lastProjectPath: string | null;
  recentProjects: RecentProject[];
};

const MAX_RECENT_PROJECTS = 12;

function getStorePath() {
  return path.join(app.getPath("userData"), "project-history.json");
}

function getProjectName(projectPath: string) {
  return path.basename(projectPath) || projectPath;
}

function normalizeProjectPath(projectPath: string) {
  return path.resolve(projectPath);
}

async function directoryExists(projectPath: string) {
  try {
    const stats = await fs.stat(projectPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function readRawState(): Promise<ProjectHistoryState> {
  try {
    const raw = await fs.readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ProjectHistoryState>;
    return {
      lastProjectPath:
        typeof parsed.lastProjectPath === "string" ? parsed.lastProjectPath : null,
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects.filter(isRecentProject)
        : [],
    };
  } catch {
    return {
      lastProjectPath: null,
      recentProjects: [],
    };
  }
}

async function writeState(state: ProjectHistoryState) {
  await fs.mkdir(path.dirname(getStorePath()), { recursive: true });
  await fs.writeFile(getStorePath(), JSON.stringify(state, null, 2), "utf8");
}

async function normalizeState(state: ProjectHistoryState) {
  const uniqueProjects = new Map<string, RecentProject>();

  for (const project of state.recentProjects) {
    const projectPath = normalizeProjectPath(project.path);
    if (uniqueProjects.has(projectPath)) {
      continue;
    }
    if (!(await directoryExists(projectPath))) {
      continue;
    }

    uniqueProjects.set(projectPath, {
      lastOpenedAt: isValidTimestamp(project.lastOpenedAt)
        ? project.lastOpenedAt
        : new Date().toISOString(),
      name: getProjectName(projectPath),
      path: projectPath,
    });
  }

  let lastProjectPath = state.lastProjectPath
    ? normalizeProjectPath(state.lastProjectPath)
    : null;

  if (lastProjectPath && !(await directoryExists(lastProjectPath))) {
    lastProjectPath = null;
  }

  const recentProjects = Array.from(uniqueProjects.values())
    .sort((left, right) =>
      right.lastOpenedAt.localeCompare(left.lastOpenedAt)
    )
    .slice(0, MAX_RECENT_PROJECTS);

  if (!lastProjectPath && recentProjects.length > 0) {
    lastProjectPath = recentProjects[0]?.path ?? null;
  }

  if (
    lastProjectPath &&
    !recentProjects.some((project) => project.path === lastProjectPath)
  ) {
    lastProjectPath = recentProjects[0]?.path ?? null;
  }

  return {
    lastProjectPath,
    recentProjects,
  };
}

async function loadState() {
  const rawState = await readRawState();
  const normalizedState = await normalizeState(rawState);

  if (JSON.stringify(rawState) !== JSON.stringify(normalizedState)) {
    await writeState(normalizedState);
  }

  return normalizedState;
}

export async function rememberProject(projectPath: string) {
  const normalizedPath = normalizeProjectPath(projectPath);
  if (!(await directoryExists(normalizedPath))) {
    return [];
  }

  const currentState = await loadState();
  const timestamp = new Date().toISOString();
  const nextProject: RecentProject = {
    lastOpenedAt: timestamp,
    name: getProjectName(normalizedPath),
    path: normalizedPath,
  };

  const nextState: ProjectHistoryState = {
    lastProjectPath: normalizedPath,
    recentProjects: [
      nextProject,
      ...currentState.recentProjects.filter(
        (project) => project.path !== normalizedPath
      ),
    ].slice(0, MAX_RECENT_PROJECTS),
  };

  await writeState(nextState);
  return nextState.recentProjects;
}

export async function getRecentProjects() {
  const state = await loadState();
  return state.recentProjects;
}

export async function getLastProjectPath() {
  const state = await loadState();
  return state.lastProjectPath;
}

function isRecentProject(value: unknown): value is RecentProject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RecentProject>;
  return (
    typeof candidate.lastOpenedAt === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.path === "string"
  );
}

function isValidTimestamp(value: string) {
  return !Number.isNaN(Date.parse(value));
}
