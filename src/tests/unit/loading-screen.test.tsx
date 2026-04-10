/**
 * Unit and property-based tests for LoadingScreen component
 * Feature: codex-ui-improvements
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LoadingScreen } from "@/components/loading-screen";

describe("LoadingScreen - Visibility", () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * Feature: codex-ui-improvements, Property 6: Loading screen visibility
   * Validates: Requirements 7.1, 7.4
   * 
   * For any app initialization sequence, the loading screen must be visible
   * until appReady === true.
   */
  it("Property 6: should be visible when isVisible is true and hidden when false", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }), // status message
        fc.boolean(), // isVisible state
        fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }), // optional error
        (status, isVisible, error) => {
          const { container, unmount } = render(
            <LoadingScreen
              status={status}
              error={error}
              isVisible={isVisible}
              onRetry={() => {}}
            />
          );

          const loadingDiv = container.firstChild as HTMLElement;

          if (isVisible) {
            // When visible, should have opacity-100 and NOT have pointer-events-none
            expect(loadingDiv.className).toContain("opacity-100");
            expect(loadingDiv.className).not.toContain("pointer-events-none");
          } else {
            // When not visible, should have opacity-0 and pointer-events-none
            expect(loadingDiv.className).toContain("opacity-0");
            expect(loadingDiv.className).toContain("pointer-events-none");
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirement 7.1
   * Loading screen should display status message
   */
  it("should display the status message when loading", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), // status message (non-whitespace)
        (status) => {
          const { unmount } = render(
            <LoadingScreen
              status={status}
              isVisible={true}
            />
          );

          // Status message should be visible (use getAllByText to handle multiple renders)
          const elements = screen.getAllByText((content, element) => {
            return element?.textContent === status;
          });
          expect(elements.length).toBeGreaterThanOrEqual(1);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirement 7.2
   * Loading screen should display error message when error occurs
   */
  it("should display error message and retry button when error is present", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), // status message (non-whitespace)
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0), // error message (non-whitespace)
        (status, error) => {
          const onRetry = () => {};
          
          const { unmount } = render(
            <LoadingScreen
              status={status}
              error={error}
              onRetry={onRetry}
              isVisible={true}
            />
          );

          // Error message should be visible (use text content matcher)
          expect(screen.getByText((content, element) => {
            return element?.textContent === error;
          })).toBeInTheDocument();
          
          // Retry button should be visible
          const retryButtons = screen.getAllByRole("button", { name: /retry/i });
          expect(retryButtons.length).toBeGreaterThanOrEqual(1);
          
          // Status message should NOT be visible when there's an error
          expect(screen.queryByText((content, element) => {
            return element?.textContent === status;
          })).not.toBeInTheDocument();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 7.1, 7.2
   * Loading screen should show spinner when loading and alert icon when error
   */
  it("should show appropriate icon based on error state", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), // status message (non-whitespace)
        fc.option(fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0), { nil: undefined }), // optional error (non-whitespace)
        (status, error) => {
          const { container, unmount } = render(
            <LoadingScreen
              status={status}
              error={error}
              isVisible={true}
              onRetry={error ? () => {} : undefined}
            />
          );

          if (error) {
            // Should have AlertCircle icon (check for lucide-circle-alert class)
            const alertIcons = container.querySelectorAll('.lucide-circle-alert');
            expect(alertIcons.length).toBeGreaterThan(0);
          } else {
            // Should have Loader2 spinner icon with animate-spin
            const spinners = container.querySelectorAll('.animate-spin');
            expect(spinners.length).toBeGreaterThan(0);
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("LoadingScreen — status message display", () => {
  afterEach(() => cleanup());

  it("displays the status message when loading (no error)", () => {
    render(<LoadingScreen status="Starting Codex..." isVisible={true} />);
    expect(screen.getByText("Starting Codex...")).toBeInTheDocument();
  });

  it("displays a different status message", () => {
    render(<LoadingScreen status="Loading workspace..." isVisible={true} />);
    expect(screen.getByText("Loading workspace...")).toBeInTheDocument();
  });

  it("does not show a retry button when there is no error", () => {
    render(<LoadingScreen status="Initializing..." isVisible={true} />);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("shows the spinner when there is no error", () => {
    const { container } = render(
      <LoadingScreen status="Initializing..." isVisible={true} />
    );
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });
});

describe("LoadingScreen — error state rendering", () => {
  afterEach(() => cleanup());

  it("displays the error message when error prop is provided", () => {
    render(
      <LoadingScreen
        status="Initializing..."
        error="Failed to connect"
        onRetry={() => {}}
        isVisible={true}
      />
    );
    expect(screen.getByText("Failed to connect")).toBeInTheDocument();
  });

  it("does not display the status message when error is present", () => {
    render(
      <LoadingScreen
        status="Initializing..."
        error="Something went wrong"
        onRetry={() => {}}
        isVisible={true}
      />
    );
    expect(screen.queryByText("Initializing...")).not.toBeInTheDocument();
  });

  it("shows the AlertCircle icon when error is present", () => {
    const { container } = render(
      <LoadingScreen
        status="Initializing..."
        error="Connection error"
        onRetry={() => {}}
        isVisible={true}
      />
    );
    expect(container.querySelector(".lucide-circle-alert")).toBeInTheDocument();
  });

  it("does not show the spinner when error is present", () => {
    const { container } = render(
      <LoadingScreen
        status="Initializing..."
        error="Connection error"
        onRetry={() => {}}
        isVisible={true}
      />
    );
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});

describe("LoadingScreen — retry button click", () => {
  afterEach(() => cleanup());

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();
    render(
      <LoadingScreen
        status="Initializing..."
        error="Failed to start"
        onRetry={onRetry}
        isVisible={true}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry each time the button is clicked", () => {
    const onRetry = vi.fn();
    render(
      <LoadingScreen
        status="Initializing..."
        error="Failed to start"
        onRetry={onRetry}
        isVisible={true}
      />
    );
    const btn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("does not render retry button when onRetry is not provided", () => {
    render(
      <LoadingScreen
        status="Initializing..."
        error="Failed to start"
        isVisible={true}
      />
    );
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});

describe("LoadingScreen — fade-out animation (isVisible prop)", () => {
  afterEach(() => cleanup());

  it("has opacity-100 class when isVisible is true", () => {
    const { container } = render(
      <LoadingScreen status="Loading..." isVisible={true} />
    );
    expect((container.firstChild as HTMLElement).className).toContain("opacity-100");
  });

  it("has opacity-0 class when isVisible is false", () => {
    const { container } = render(
      <LoadingScreen status="Loading..." isVisible={false} />
    );
    expect((container.firstChild as HTMLElement).className).toContain("opacity-0");
  });

  it("has pointer-events-none when isVisible is false (prevents interaction during fade)", () => {
    const { container } = render(
      <LoadingScreen status="Loading..." isVisible={false} />
    );
    expect((container.firstChild as HTMLElement).className).toContain("pointer-events-none");
  });

  it("does not have pointer-events-none when isVisible is true", () => {
    const { container } = render(
      <LoadingScreen status="Loading..." isVisible={true} />
    );
    expect((container.firstChild as HTMLElement).className).not.toContain("pointer-events-none");
  });

  it("has transition-opacity class for smooth fade animation", () => {
    const { container } = render(
      <LoadingScreen status="Loading..." isVisible={true} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/transition/);
  });
});
