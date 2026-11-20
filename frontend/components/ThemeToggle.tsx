"use client";

/**
 * Dark/light toggle. Dark is the default; "light" is persisted in
 * localStorage and applied via <html data-theme="light"> (see the
 * pre-paint script in app/layout.tsx).
 *
 * The current theme is read from the DOM with useSyncExternalStore so
 * the component stays in sync with the pre-paint script without a
 * hydration mismatch (the server always renders the dark variant).
 */
import { useSyncExternalStore } from "react";

const THEME_EVENT = "theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function isLightTheme() {
  return document.documentElement.dataset.theme === "light";
}

export default function ThemeToggle() {
  const isLight = useSyncExternalStore(subscribe, isLightTheme, () => false);

  const toggle = () => {
    if (isLight) {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem("theme");
    } else {
      document.documentElement.dataset.theme = "light";
      localStorage.setItem("theme", "light");
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {isLight ? (
        /* moon */
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        /* sun */
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
