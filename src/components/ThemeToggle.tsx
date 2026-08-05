"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore */
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const initial: Theme =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-full border border-[var(--line)] bg-surface px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:bg-surface-strong"
      aria-label={theme === "dark" ? "עבור לתצוגה בהירה" : "עבור לתצוגה כהה"}
      title={theme === "dark" ? "תצוגה בהירה" : "תצוגה כהה"}
    >
      {theme === "dark" ? "תצוגה בהירה" : "תצוגה כהה"}
    </button>
  );
}
