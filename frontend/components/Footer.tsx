/**
 * Minimal footer with social links and a small easter egg tying back
 * to the agent theme.
 */
import { CV } from "@/lib/knowledge";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 sm:flex-row sm:items-center sm:px-6">
        <p className="font-mono text-xs text-muted">
          <span className="text-accent">●</span> agents idle. thanks for visiting.
        </p>
        <div className="flex items-center gap-5 font-mono text-xs text-muted">
          <a
            href={CV.links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-fg"
          >
            github
          </a>
          <a
            href={CV.links.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-fg"
          >
            linkedin
          </a>
          <a href={`mailto:${CV.email}`} className="transition-colors hover:text-fg">
            email
          </a>
          <span>built with Next.js</span>
        </div>
      </div>
    </footer>
  );
}
