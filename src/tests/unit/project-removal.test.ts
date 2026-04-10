/**
 * Property-based tests for project removal from recents
 * Feature: codex-ui-improvements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Mock electron app
vi.mock("electron", () => ({
  app: {
    getPath: () => path.join(os.tmpdir(), "test-project-store"),
  },
}));

describe("Project Removal Persistence", () => {
  let testDir: string;
  let storeFile: string;

  beforeEach(async () => {
    // Create a temporary directory for test data
    testDir = path.join(os.tmpdir(), "test-project-store");
    storeFile = path.join(testDir, "project-history.json");
    
    // Ensure clean state
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
    await fs.mkdir(testDir, { recursive: true });
    
    // Reset modules to get fresh imports
    vi.resetModules();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Feature: codex-ui-improvements, Property 4: Project removal persistence
   * Validates: Requirements 5.3
   * 
   * For any project removed from recents, calling getRecentProjects() after
   * app restart must not include that project.
   */
  it("Property 4: removed projects should not appear after simulated restart", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a list of 2-10 unique project paths with valid characters
        fc.uniqueArray(
          fc.record({
            path: fc.stringMatching(/^[a-zA-Z0-9_-]{5,30}$/),
            name: fc.stringMatching(/^[a-zA-Z0-9_-]{3,20}$/),
            lastOpenedAt: fc.date().map(d => d.toISOString()),
          }),
          { 
            minLength: 2, 
            maxLength: 10,
            selector: (item) => item.path
          }
        ),
        // Index of project to remove
        fc.nat(),
        async (projects, removeIndex) => {
          // Skip if no projects
          if (projects.length === 0) return;
          
          // Normalize remove index to valid range
          const indexToRemove = removeIndex % projects.length;
          const projectToRemove = projects[indexToRemove];
          
          if (!projectToRemove) return;

          // Create mock directories for all projects
          for (const project of projects) {
            const projectDir = path.join(testDir, "projects", project.path);
            await fs.mkdir(projectDir, { recursive: true });
          }

          // Import fresh module
          const { rememberProject, removeRecentProject, getRecentProjects } = 
            await import("@/main/project-store");

          // Add all projects to recents
          for (const project of projects) {
            const projectDir = path.join(testDir, "projects", project.path);
            await rememberProject(projectDir);
          }

          // Verify all projects are in recents
          const beforeRemoval = await getRecentProjects();
          expect(beforeRemoval.length).toBeGreaterThan(0);

          // Remove the selected project
          const projectPathToRemove = path.join(testDir, "projects", projectToRemove.path);
          await removeRecentProject(projectPathToRemove);

          // Simulate app restart by resetting modules and re-importing
          vi.resetModules();
          const { getRecentProjects: getRecentProjectsAfterRestart } = 
            await import("@/main/project-store");

          // Get projects after "restart"
          const afterRestart = await getRecentProjectsAfterRestart();

          // Verify the removed project is not in the list
          const removedProjectExists = afterRestart.some(
            p => p.path === projectPathToRemove
          );
          expect(removedProjectExists).toBe(false);

          // Verify other projects are still there (if any)
          if (projects.length > 1) {
            expect(afterRestart.length).toBeGreaterThan(0);
            expect(afterRestart.length).toBe(beforeRemoval.length - 1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional test: Verify removal persists to disk
   */
  it("should persist removal to disk immediately", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate unique valid project paths
        fc.uniqueArray(
          fc.stringMatching(/^[a-zA-Z0-9_-]{5,30}$/),
          { minLength: 3, maxLength: 8 }
        ),
        async (projectPaths) => {
          if (projectPaths.length < 2) return;

          // Create mock directories
          for (const projectPath of projectPaths) {
            const projectDir = path.join(testDir, "projects", projectPath);
            await fs.mkdir(projectDir, { recursive: true });
          }

          // Import fresh module
          const { rememberProject, removeRecentProject, getRecentProjects } = 
            await import("@/main/project-store");

          // Add all projects
          for (const projectPath of projectPaths) {
            const fullPath = path.join(testDir, "projects", projectPath);
            await rememberProject(fullPath);
          }

          // Remove first project
          const pathToRemove = path.join(testDir, "projects", projectPaths[0]);
          await removeRecentProject(pathToRemove);

          // Read the store file directly
          const storeContent = await fs.readFile(storeFile, "utf8");
          const storeData = JSON.parse(storeContent);

          // Verify the removed project is not in the persisted data
          const removedInStore = storeData.recentProjects.some(
            (p: { path: string }) => p.path === pathToRemove
          );
          expect(removedInStore).toBe(false);

          // Verify it's also not in the in-memory list
          const currentProjects = await getRecentProjects();
          const removedInMemory = currentProjects.some(p => p.path === pathToRemove);
          expect(removedInMemory).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Edge case: Removing non-existent project should not error
   */
  it("should handle removal of non-existent project gracefully", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-zA-Z0-9_-]{5,50}$/),
        async (nonExistentPath) => {
          const { removeRecentProject, getRecentProjects } = 
            await import("@/main/project-store");

          const fullPath = path.join(testDir, "nonexistent", nonExistentPath);

          // Should not throw
          await expect(removeRecentProject(fullPath)).resolves.toBeDefined();

          // Should return empty or existing list
          const projects = await getRecentProjects();
          expect(Array.isArray(projects)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});
