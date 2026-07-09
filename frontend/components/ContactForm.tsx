"use client";

/**
 * Contact section: direct links plus a simple form.
 *
 * The form posts to NEXT_PUBLIC_CONTACT_FORM_ENDPOINT (e.g. a Formspree
 * URL) if configured; otherwise it degrades to a mailto: draft so it
 * always works, even on a fully static deployment.
 */
import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CV } from "@/lib/knowledge";
import SectionHeading from "./SectionHeading";

const ENDPOINT = process.env.NEXT_PUBLIC_CONTACT_FORM_ENDPOINT;

type SendState = "idle" | "sending" | "sent" | "error";

export default function ContactForm() {
  const prefersReducedMotion = useReducedMotion();
  const [state, setState] = useState<SendState>("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    if (!ENDPOINT) {
      // Fallback: open a pre-filled email draft.
      const subject = encodeURIComponent(`Portfolio contact from ${data.get("name")}`);
      const body = encodeURIComponent(
        `${data.get("message")}\n\n— ${data.get("name")} (${data.get("email")})`
      );
      window.location.href = `mailto:${CV.email}?subject=${subject}&body=${body}`;
      return;
    }

    setState("sending");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data,
      });
      if (!res.ok) throw new Error(`Form endpoint responded with ${res.status}`);
      setState("sent");
      form.reset();
    } catch {
      setState("error");
    }
  }

  const inputClasses =
    "w-full rounded-lg border border-line bg-panel px-4 py-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none";

  return (
    <section id="contact" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <SectionHeading index="06" label="contact" title="Let's work together" />

      <div className="grid gap-10 lg:grid-cols-2">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.3 }}
        >
          <p className="max-w-md leading-relaxed text-muted">
            Open to collaboration, research, and interesting agent problems.
            The fastest channel is email — or send a message with the form.
          </p>
          <ul className="mt-8 space-y-3 font-mono text-sm">
            <li>
              <a href={`mailto:${CV.email}`} className="text-accent hover:text-accent-bright">
                {CV.email}
              </a>
            </li>
            <li>
              <a
                href={CV.links.github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-fg"
              >
                github.com/Valedicode ↗
              </a>
            </li>
            <li>
              <a
                href={CV.links.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-fg"
              >
                linkedin.com/in/chongkevinha/ ↗
              </a>
            </li>
          </ul>
        </motion.div>

        <motion.form
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.3, delay: 0.08 }}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-name" className="sr-only">
                Name
              </label>
              <input
                id="contact-name"
                name="name"
                type="text"
                required
                placeholder="Name"
                autoComplete="name"
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="sr-only">
                Email
              </label>
              <input
                id="contact-email"
                name="email"
                type="email"
                required
                placeholder="Email"
                autoComplete="email"
                className={inputClasses}
              />
            </div>
          </div>
          <div>
            <label htmlFor="contact-message" className="sr-only">
              Message
            </label>
            <textarea
              id="contact-message"
              name="message"
              required
              rows={5}
              placeholder="Your message…"
              className={inputClasses}
            />
          </div>
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={state === "sending"}
              className="rounded-lg bg-accent px-6 py-3 font-mono text-sm font-medium text-on-accent transition-colors hover:bg-accent-bright disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Send message"}
            </button>
            <p className="text-sm text-muted" role="status">
              {state === "sent" && "Message sent — thanks!"}
              {state === "error" && "Something went wrong — try email instead."}
            </p>
          </div>
        </motion.form>
      </div>
    </section>
  );
}
