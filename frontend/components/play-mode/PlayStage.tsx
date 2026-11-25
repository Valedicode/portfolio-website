"use client";

/**
 * Play mode: a small 3D agent the visitor walks around the page. It comments
 * on whichever section it is standing in, reacts to being poked, and gets
 * dragged along when the page is scrolled out from under it.
 *
 * The agent lives in page coordinates (its feet are a point in the
 * document), drawn in a small fixed canvas that is moved with a transform.
 * One requestAnimationFrame loop owns everything that changes per frame and
 * writes straight to the DOM; React state is only used for the speech
 * bubble's text, which changes every few seconds.
 *
 * Loaded on demand (see PlayMode.tsx), so three.js is not in the page's
 * initial bundle.
 */
import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";
import {
  GREETING,
  IDLE_LINES,
  POKE_LINES,
  SCROLL_LINES,
  ZONES,
  ZONE_LINES,
  createDeck,
  type Zone,
} from "./lines";
import { FEET_Y, FIGURE_H, STAGE_H, STAGE_W, createRobot, type Robot } from "./robot";
import { setPlayMode } from "./store";

/** Height of the fixed nav (h-14); the agent stays below it. */
const NAV_H = 56;
/** Walking speed in CSS px per second. */
const SPEED = 270;
/** Half the agent's width: how close it may get to the page's side edges. */
const HALF_W = 46;
/** Space kept free above the agent's head so a bubble usually fits there. */
const BUBBLE_ROOM = 104;
/** Typewriter pace of the speech bubble. */
const TYPE_MS = 22;
/** A section must hold the agent this long before it comments (ms). */
const ZONE_SETTLE = 350;
/** Minimum gap between two section comments (ms). */
const ZONE_GAP = 1200;

type Direction = "up" | "down" | "left" | "right";

const KEYS: Record<string, Direction> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

interface Speech {
  id: number;
  text: string;
  open: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function damp(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Typing into a field must keep working while play mode is on. */
function isTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}

/** Space on a focused control should press it, not make the agent jump. */
function isControl(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.closest("a, button, summary, [role='button']") !== null
  );
}

function hasWebGL() {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

/** Types the text out; the untyped rest is laid out invisibly so the bubble never resizes. */
function SpeechText({ text, instant }: { text: string; instant: boolean }) {
  const [shown, setShown] = useState(instant ? text.length : 0);
  const done = shown >= text.length;

  useEffect(() => {
    if (done) return;
    const timer = window.setInterval(() => setShown((n) => n + 1), TYPE_MS);
    return () => window.clearInterval(timer);
  }, [done]);

  return (
    <>
      {text.slice(0, shown)}
      <span className="opacity-0">{text.slice(shown)}</span>
    </>
  );
}

/** On-screen stick for touch devices; writes a -1..1 vector into `stickRef`. */
function Joystick({ stickRef }: { stickRef: RefObject<{ x: number; y: number }> }) {
  const knobRef = useRef<HTMLSpanElement>(null);
  const pointerRef = useRef<number | null>(null);

  const steer = (e: PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const radius = rect.width / 2;
    let x = (e.clientX - rect.left - radius) / radius;
    let y = (e.clientY - rect.top - radius) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    // Small dead zone so a resting thumb does not make the agent creep.
    const live = length > 0.18;
    stickRef.current.x = live ? x : 0;
    stickRef.current.y = live ? y : 0;
    const knob = knobRef.current;
    if (knob) {
      knob.style.transition = "none";
      knob.style.transform = `translate3d(${x * radius * 0.55}px, ${y * radius * 0.55}px, 0)`;
    }
  };

  const grab = (e: PointerEvent<HTMLDivElement>) => {
    // Ignore a second finger while the first is steering.
    if (pointerRef.current !== null) return;
    pointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    steer(e);
  };

  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    stickRef.current.x = 0;
    stickRef.current.y = 0;
    const knob = knobRef.current;
    if (knob) {
      knob.style.transition = "transform 150ms cubic-bezier(0.23, 1, 0.32, 1)";
      knob.style.transform = "";
    }
  };

  return (
    <div
      onPointerDown={grab}
      onPointerMove={steer}
      onPointerUp={release}
      onPointerCancel={release}
      aria-hidden="true"
      className="fixed bottom-6 right-6 z-40 hidden h-28 w-28 touch-none items-center justify-center rounded-full border border-line bg-panel/70 backdrop-blur-sm select-none pointer-coarse:flex"
    >
      <span
        ref={knobRef}
        className="h-12 w-12 rounded-full border border-accent/60 bg-accent/25"
      />
    </div>
  );
}

export default function PlayStage() {
  const calm = useReducedMotion() ?? false;
  // Without WebGL the agent is the flat mascot image; it still walks and talks.
  const [flat] = useState(() => !hasWebGL());
  const [speech, setSpeech] = useState<Speech | null>(null);

  const figureRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLSpanElement>(null);
  const stickRef = useRef({ x: 0, y: 0 });
  const pokeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;

    let robot: Robot | null = null;
    if (!flat) {
      try {
        robot = createRobot(calm);
        mountRef.current?.appendChild(robot.canvas);
        robot.setLightTheme(document.documentElement.dataset.theme === "light");
      } catch (error) {
        console.warn("Play mode: could not start WebGL", error);
      }
    }

    /* ---------- where the agent is ---------- */

    const root = document.documentElement;
    // Feet position in page coordinates. Starts right of the hero copy.
    let x = clamp(root.clientWidth * 0.72, HALF_W, root.clientWidth - HALF_W);
    let y = window.scrollY + Math.max(NAV_H + FIGURE_H + BUBBLE_ROOM, window.innerHeight * 0.66);
    let vx = 0;
    let vy = 0;
    let dragSpeed = 0;
    let draggedFor = 0;

    const held = new Set<Direction>();
    const cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    /* ---------- which section it is in ---------- */

    const zoneElements = ZONES.map((zone) =>
      zone === "footer" ? document.querySelector("footer") : document.getElementById(zone)
    );
    let zoneSpans: { zone: Zone; top: number; bottom: number }[] = [];
    let measuredAt = -Infinity;

    // Sections change height (e.g. "show all projects"), so re-measure now and then.
    const measureZones = () => {
      const scrollY = window.scrollY;
      zoneSpans = ZONES.flatMap((zone, i) => {
        const element = zoneElements[i];
        if (!element) return [];
        const rect = element.getBoundingClientRect();
        return [{ zone, top: rect.top + scrollY, bottom: rect.bottom + scrollY }];
      });
    };

    /* ---------- what it says ---------- */

    const zoneDecks = Object.fromEntries(
      ZONES.map((zone) => [zone, createDeck(ZONE_LINES[zone])])
    ) as Record<Zone, () => string>;
    const pokeDeck = createDeck(POKE_LINES);
    const idleDeck = createDeck(IDLE_LINES);
    const scrollDeck = createDeck(SCROLL_LINES);

    let speechId = 0;
    let speaking = false;
    let speakingUntil = 0;
    /** Until then, the current line may not be interrupted by a section comment. */
    let heldUntil = 0;
    let lastSpokeAt = -Infinity;
    /** When the last bubble closed on its own. */
    let quietSince = -Infinity;
    let greeted = false;

    let zone: Zone | null = null;
    let zoneSince = 0;
    let announced: Zone | null = null;

    let lastActiveAt = 0;
    let idleRemarks = 0;
    let lastScrollRemarkAt = -Infinity;

    /** `hold`: ms the line is protected for, or true for its whole duration. */
    const say = (text: string, now: number, hold: number | true = 0) => {
      const typing = calm ? 0 : text.length * TYPE_MS;
      speechId += 1;
      speaking = true;
      speakingUntil = now + typing + 1800 + text.length * 28;
      heldUntil = hold === true ? speakingUntil : now + hold;
      lastSpokeAt = now;
      setSpeech({ id: speechId, text, open: true });
    };

    pokeRef.current = () => {
      const now = performance.now();
      robot?.jump();
      lastActiveAt = now;
      say(pokeDeck(), now, 1500);
    };

    /* ---------- the loop ---------- */

    let frameId = 0;
    let startedAt = 0;
    let last = 0;

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (startedAt === 0) {
        startedAt = last = lastActiveAt = now;
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const viewW = root.clientWidth;
      const viewH = window.innerHeight;
      let scrollY = window.scrollY;

      // Steering: keys and the touch stick add up, capped at full speed.
      let inputX =
        (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0) + stickRef.current.x;
      let inputY = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0) + stickRef.current.y;
      const inputLength = Math.hypot(inputX, inputY);
      if (inputLength > 1) {
        inputX /= inputLength;
        inputY /= inputLength;
      }
      const steering = inputLength > 0.05;

      // The agent has to stay on screen. When the visitor scrolls the page
      // out from under it, the edge of the viewport pushes it along, and how
      // fast it is being pushed drives the "carried" pose. Once the page has
      // scrolled a little, the top edge keeps room for a bubble overhead.
      const headroom = NAV_H + FIGURE_H + 8;
      const rideOffset =
        headroom + Math.max(0, Math.min(BUBBLE_ROOM, scrollY, viewH * 0.5 - headroom));
      const rideTop = scrollY + rideOffset;
      const rideBottom = Math.max(rideTop, scrollY + viewH - 10);
      const pushed = clamp(y, rideTop, rideBottom);
      dragSpeed = damp(dragSpeed, Math.abs(pushed - y) / Math.max(dt, 0.001), 10, dt);
      y = pushed;
      const carry = clamp((dragSpeed - 150) / 900, 0, 1);
      draggedFor = carry > 0.5 ? draggedFor + dt : 0;

      // Walking. Running into an edge just stops it; that is not being carried.
      vx = damp(vx, inputX * SPEED, 14, dt);
      vy = damp(vy, inputY * SPEED, 14, dt);
      x = clamp(x + vx * dt, HALF_W, Math.max(HALF_W, viewW - HALF_W));
      y = clamp(y + vy * dt, rideTop, Math.min(rideBottom, root.scrollHeight - 10));

      // While steering, the page follows the agent like a camera. The band it
      // is kept in sits well inside the push limits above, so following never
      // counts as a push, and the scroll eases towards it instead of snapping.
      if (steering) {
        const bandTop = Math.min(rideOffset + 40, viewH * 0.6);
        const bandBottom = Math.max(viewH * 0.8, bandTop + 1);
        const screenY = y - scrollY;
        const excess =
          screenY > bandBottom ? screenY - bandBottom : screenY < bandTop ? screenY - bandTop : 0;
        if (excess !== 0) {
          window.scrollTo({
            top: scrollY + excess * (1 - Math.exp(-10 * dt)),
            behavior: "instant",
          });
          scrollY = window.scrollY;
        }
      }

      if (steering || carry > 0) {
        lastActiveAt = now;
        if (steering) idleRemarks = 0;
      }

      /* ----- speech ----- */

      if (!greeted) {
        greeted = true;
        const touch = window.matchMedia("(pointer: coarse)").matches;
        say(touch ? GREETING.touch : GREETING.keyboard, now, true);
        robot?.wave();
        if (!calm) robot?.jump();
      }

      if (speaking && now > speakingUntil) {
        speaking = false;
        lastActiveAt = quietSince = now;
        setSpeech((current) => current && { ...current, open: false });
      }

      if (now - measuredAt > 500) {
        measuredAt = now;
        measureZones();
      }
      // The chest, not the feet, decides which section the agent is "in".
      const probe = y - FIGURE_H * 0.45;
      const here = zoneSpans.find((span) => probe >= span.top && probe < span.bottom)?.zone;
      if (here && here !== zone) {
        zone = here;
        zoneSince = now;
      }

      if (now >= heldUntil) {
        if (
          zone &&
          zone !== announced &&
          now - zoneSince > ZONE_SETTLE &&
          now - lastSpokeAt > ZONE_GAP &&
          // Cutting in on a line is fine; starting the instant one ends is not.
          (speaking || now - quietSince > 450)
        ) {
          // Arrived somewhere new: comment on it.
          announced = zone;
          idleRemarks = 0;
          say(zoneDecks[zone](), now);
        } else if (draggedFor > 0.25 && now - lastScrollRemarkAt > 20_000) {
          lastScrollRemarkAt = now;
          say(scrollDeck(), now, 1500);
        } else if (
          !speaking &&
          zone &&
          idleRemarks < 3 &&
          now - lastActiveAt > 12_000 + idleRemarks * 8000
        ) {
          // Left standing: mostly more about this section, sometimes about waiting.
          idleRemarks += 1;
          say(idleRemarks === 2 ? idleDeck() : zoneDecks[zone](), now);
        }
      }

      /* ----- draw ----- */

      const screenX = x;
      const screenY = y - scrollY;
      const headY = screenY - FIGURE_H * 0.7;

      const lift = robot?.update({
        dt,
        time: (now - startedAt) / 1000,
        moveX: vx / SPEED,
        moveY: vy / SPEED,
        lookX: clamp((cursor.x - screenX) / 320, -1, 1),
        lookY: clamp((cursor.y - headY) / 320, -1, 1),
        talking: speaking,
        carry,
      });

      figure.style.transform = `translate3d(${screenX - STAGE_W / 2}px, ${screenY - FEET_Y}px, 0)`;

      // Bubble: above the head and centred on the agent, kept on screen and
      // rising with a jump; it drops below the feet when there is no room above.
      const bubble = bubbleRef.current;
      const tail = tailRef.current;
      if (bubble && tail) {
        const width = bubble.offsetWidth;
        const height = bubble.offsetHeight;
        const left = clamp(screenX - width / 2, 8, Math.max(8, viewW - width - 8));
        // Which side is decided from the standing position, so a jump near
        // the top of the screen does not make the bubble flip back and forth.
        const restTop = screenY - FIGURE_H - 14 - height;
        const below = restTop < NAV_H + 6;
        const top = below ? screenY + 16 : Math.max(NAV_H + 6, restTop - (lift ?? 0));
        bubble.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        bubble.dataset.side = below ? "below" : "above";
        tail.style.transform = `translate3d(${clamp(screenX - left, 18, width - 18) - 5}px, 0, 0) rotate(45deg)`;
      }
    };
    frameId = requestAnimationFrame(tick);

    /* ---------- input ---------- */

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target)) return;
      if (e.key === "Escape") {
        setPlayMode(false);
        return;
      }
      const direction = KEYS[e.code];
      if (direction) {
        // Arrow keys would otherwise scroll the page under the agent.
        e.preventDefault();
        held.add(direction);
      } else if (e.code === "Space" && !isControl(e.target)) {
        e.preventDefault();
        if (!e.repeat) robot?.jump();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const direction = KEYS[e.code];
      if (direction) held.delete(direction);
    };
    // A key released while the window is unfocused never fires keyup.
    const releaseKeys = () => held.clear();
    const onPointerMove = (e: globalThis.PointerEvent) => {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
    };

    const themeObserver = new MutationObserver(() => {
      robot?.setLightTheme(root.dataset.theme === "light");
    });
    themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseKeys);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      cancelAnimationFrame(frameId);
      themeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseKeys);
      window.removeEventListener("pointermove", onPointerMove);
      pokeRef.current = () => {};
      if (robot) {
        robot.canvas.remove();
        robot.dispose();
      }
    };
  }, [calm, flat]);

  return (
    <>
      {/* The agent. Only its body takes clicks; the rest lets the page through. */}
      <div
        ref={figureRef}
        className="pointer-events-none fixed left-0 top-0 z-40 opacity-100 transition-opacity duration-200 ease-out will-change-transform starting:opacity-0"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        <div ref={mountRef} />
        {flat && (
          // The mascot image has an opaque background, so it is framed as a badge.
          <Image
            src="/agents/planner.png"
            alt=""
            width={112}
            height={112}
            draggable={false}
            className="absolute left-1/2 -translate-x-1/2 select-none rounded-2xl border border-line"
            style={{ top: FEET_Y - 112 }}
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            pokeRef.current();
            // After a mouse click the button would stay focused, and the next
            // movement key would draw a focus ring around the agent for good.
            // Keyboard activation (detail === 0) keeps its focus and ring.
            if (e.detail > 0) e.currentTarget.blur();
          }}
          aria-label="Poke the agent"
          className="pointer-events-auto absolute left-1/2 w-[84px] -translate-x-1/2 cursor-pointer rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{ top: FEET_Y - FIGURE_H, height: FIGURE_H }}
        />
      </div>

      {/* Speech bubble: placed by the loop, shown and hidden by data-open. */}
      <div
        ref={bubbleRef}
        data-side="above"
        aria-hidden="true"
        className="play-bubble-anchor pointer-events-none fixed left-0 top-0 z-40 w-max max-w-[min(17rem,calc(100vw-1rem))] will-change-transform"
      >
        <div
          data-open={speech?.open ?? false}
          className="play-bubble relative rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[13px] leading-snug text-fg shadow-[0_8px_24px_-8px_rgb(0_0_0/0.45)]"
        >
          {speech && <SpeechText key={speech.id} text={speech.text} instant={calm} />}
          <span ref={tailRef} className="play-bubble-tail" />
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {speech?.open ? speech.text : ""}
      </p>

      {/* Controls: a key legend for mouse-and-keyboard, a stick for touch. */}
      <p
        aria-hidden="true"
        className="pointer-events-none fixed bottom-4 left-1/2 z-40 hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-panel/90 px-4 py-2 font-mono text-[11px] text-muted backdrop-blur-sm pointer-fine:block"
      >
        <span className="text-fg">WASD</span> / <span className="text-fg">arrows</span> walk ·{" "}
        <span className="text-fg">Space</span> jump · click the agent ·{" "}
        <span className="text-fg">Esc</span> exit
      </p>
      <Joystick stickRef={stickRef} />
    </>
  );
}
