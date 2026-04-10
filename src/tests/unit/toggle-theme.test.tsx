import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import ToggleTheme from "@/components/toggle-theme";

test("renders ToggleTheme", () => {
  const { getByRole } = render(<ToggleTheme />);
  const isButton = getByRole("button");

  expect(isButton).toBeInTheDocument();
});

test("has icon", () => {
  const { getByRole } = render(<ToggleTheme />);
  const button = getByRole("button");
  const icons = button.querySelectorAll("svg");

  expect(icons).toHaveLength(2);
});

test("defaults to a dark-mode toggle", () => {
  const { getByRole } = render(<ToggleTheme />);
  const button = getByRole("button");
  const iconClassNames = Array.from(button.querySelectorAll("svg")).map((icon) =>
    icon.getAttribute("class")
  );

  expect(button).toHaveAccessibleName("Switch to light mode");
  expect(iconClassNames.some((value) => value?.includes("lucide-moon"))).toBe(true);
  expect(iconClassNames.some((value) => value?.includes("lucide-sun"))).toBe(true);
});
