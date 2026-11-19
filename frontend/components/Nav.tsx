"use client";

/**
 * Fixed top nav with anchor links, the theme toggle, and a small status
 * pill that reflects what the demo's agents are doing right now.
 */
import { useAgents } from "./agent-demo/AgentContext";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "#about", label: "About" },
  { href: "#agents", label: "Agents" },
  { href: "#projects", label: "Projects" },
  { href: "#skills", label: "Skills" },
  { href: "#contact", label: "Contact" },
];

export default function Nav() {
  const { status } = useAgents();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-sm">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <a href="#top" className="font-mono text-sm font-semibold tracking-tight">
          kevin<span className="text-accent">.</span>ha
        </a>

        <ul className="hidden items-center gap-6 md:flex">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <a
                href={href}
                className="text-sm text-muted transition-colors hover:text-fg"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          {/* Agent status pill — a small detail that rewards attention */}
          <span
            className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-xs text-muted sm:flex"
            role="status"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "working"
                  ? "animate-pulse bg-accent"
                  : "bg-accent/60"
              }`}
              aria-hidden="true"
            />
            {status === "working" ? "3 agents active" : "3 agents idle"}
          </span>
          <a
            href="/CV.pdf"
            download
            className="hidden rounded-lg border border-line px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-fg sm:block"
          >
            CV ↓
          </a>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
