/**
 * Property-based tests for slash command filter
 * Feature: codex-session-manager
 */
// Feature: codex-session-manager, Property 15: Slash command filter correctness
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { filterSlashCommands } from "@/components/codex/slash-commands";

// ---------------------------------------------------------------------------
// Minimal command registry for testing (mirrors the real registry names/descriptions)
// ---------------------------------------------------------------------------

const TEST_COMMANDS = [
  { name: "model", description: "Switch response model for this thread" },
  { name: "plan", description: "Switch this thread into plan mode" },
  { name: "default", description: "Switch this thread back to normal chat mode" },
  { name: "mcp", description: "Open the MCP server status panel" },
  { name: "effort", description: "Open the reasoning effort picker" },
  { name: "supervised", description: "Set access level to supervised (approve before executing)" },
  { name: "full-access", description: "Set access level to full access (execute without prompting)" },
];

// ---------------------------------------------------------------------------
// Property 15: Slash command filter correctness
// ---------------------------------------------------------------------------

describe("Property 15: Slash command filter correctness", () => {
  it("returns empty list for any input that does not start with '/'", () => {
    // Feature: codex-session-manager, Property 15: Slash command filter correctness
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 80 }).filter((s) => !s.startsWith("/")),
        (input) => {
          const result = filterSlashCommands(input, TEST_COMMANDS);
          expect(result).toHaveLength(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("returns all commands when input is exactly '/'", () => {
    const result = filterSlashCommands("/", TEST_COMMANDS);
    expect(result).toHaveLength(TEST_COMMANDS.length);
  });

  it("returns non-empty list iff suffix matches at least one command name or description", () => {
    // Feature: codex-session-manager, Property 15: Slash command filter correctness
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        (suffix) => {
          const input = `/${suffix}`;
          const result = filterSlashCommands(input, TEST_COMMANDS);
          const lower = suffix.toLowerCase();

          const expectedNonEmpty = TEST_COMMANDS.some(
            (cmd) =>
              cmd.name.toLowerCase().includes(lower) ||
              cmd.description.toLowerCase().includes(lower)
          );

          if (expectedNonEmpty) {
            expect(result.length).toBeGreaterThan(0);
          } else {
            expect(result).toHaveLength(0);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("every returned command matches the suffix in name or description", () => {
    // Feature: codex-session-manager, Property 15: Slash command filter correctness
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        (suffix) => {
          const input = `/${suffix}`;
          const result = filterSlashCommands(input, TEST_COMMANDS);
          const lower = suffix.toLowerCase();

          for (const cmd of result) {
            const matches =
              cmd.name.toLowerCase().includes(lower) ||
              cmd.description.toLowerCase().includes(lower);
            expect(matches).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("no command that matches the suffix is excluded from the result", () => {
    // Feature: codex-session-manager, Property 15: Slash command filter correctness
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        (suffix) => {
          const input = `/${suffix}`;
          const result = filterSlashCommands(input, TEST_COMMANDS);
          const lower = suffix.toLowerCase();
          const resultNames = new Set(result.map((c) => c.name));

          for (const cmd of TEST_COMMANDS) {
            const shouldMatch =
              cmd.name.toLowerCase().includes(lower) ||
              cmd.description.toLowerCase().includes(lower);
            if (shouldMatch) {
              expect(resultNames.has(cmd.name)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
