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

function playThemeFlash(next: Theme) {
  if (typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.querySelectorAll(".theme-flash").forEach((node) => node.remove());

  const flash = document.createElement("div");
  flash.className = `theme-flash theme-flash-${next}`;
  flash.setAttribute("aria-hidden", "true");
  document.body.appendChild(flash);

  const cleanup = () => flash.remove();
  flash.addEventListener("animationend", cleanup, { once: true });
  window.setTimeout(cleanup, 900);
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
    playThemeFlash(next);
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
