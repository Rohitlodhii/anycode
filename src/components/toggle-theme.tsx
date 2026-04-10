import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentTheme, setTheme } from "@/actions/theme";
import { Button } from "@/components/ui/button";
import type { ThemeMode } from "@/types/theme-mode";
import { cn } from "@/utils/tailwind";

export default function ToggleTheme() {
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    let active = true;

    void getCurrentTheme()
      .then(({ local, system }) => {
        if (!active) {
          return;
        }

        setThemeState(local === "system" || local === null ? system : local);
      })
      .catch(() => {
        if (active) {
          setThemeState("dark");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleToggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    await setTheme(nextTheme);
    setThemeState(nextTheme);
  }

  const isDarkMode = theme === "dark";

  return (
    <Button
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      className="relative"
      onClick={() => void handleToggleTheme()}
      size="icon-lg"
      title={isDarkMode ? "Light mode" : "Dark mode"}
      type="button"
      variant="ghost"
    >
      <Sun
        aria-hidden="true"
        className={cn(
          "absolute transition-all",
          isDarkMode ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
        )}
      />
      <Moon
        aria-hidden="true"
        className={cn(
          "absolute transition-all",
          isDarkMode ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0"
        )}
      />
      <span className="sr-only">
        {isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      </span>
    </Button>
  );
}
