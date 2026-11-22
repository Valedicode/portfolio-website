"use client";

/**
 * Nav button that turns play mode on and off. Icon-only on narrow screens so
 * the nav keeps its width; the label appears from lg up.
 */
import type { MouseEvent } from "react";
import { setPlayMode, usePlayMode } from "./store";

export default function PlayModeToggle() {
  const on = usePlayMode();

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    setPlayMode(!on);
    // A mouse click leaves focus on the button, so the next Space press would
    // switch play mode straight back off instead of making the agent jump.
    // Keyboard activation (detail === 0) keeps its focus.
    if (e.detail > 0) e.currentTarget.blur();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Exit play mode" : "Enter play mode: walk an agent around the page"}
      title={on ? "Exit play mode" : "Play mode: walk an agent around the page"}
      className={`flex h-9 items-center justify-center gap-2 rounded-lg border px-2.5 font-mono text-xs transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        on
          ? "border-accent bg-accent/10 text-accent"
          : "border-line text-muted hover:border-accent hover:text-fg"
      }`}
    >
      {/* gamepad */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="7" width="20" height="11" rx="5.5" />
        <path d="M6.5 12.5h4M8.5 10.5v4" />
        <path d="M15.5 13.5h.01M18 11.5h.01" />
      </svg>
      <span className="hidden lg:inline">{on ? "Exit" : "Play"}</span>
    </button>
  );
}
