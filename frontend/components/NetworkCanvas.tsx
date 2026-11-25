"use client";

/**
 * The hero's ambient agent network: lightweight 2D-canvas nodes that
 * drift slowly, link up when close, and quietly pulse — plus one node
 * that eases toward the visitor's cursor.
 *
 * Uses --graph-* CSS tokens (not --accent) so light mode can use darker,
 * higher-contrast strokes without changing button/link colors.
 */
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  layer: "regular" | "hub";
}

const LINK_DISTANCE = 180;
const NODE_DENSITY = 1 / 18_000;
const HUB_RATIO = 0.14;

/**
 * Keeps the hero copy readable by making the left-center text zone sparser,
 * while allowing stronger clustering toward the outer edges.
 */
function samplePoint(width: number, height: number) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = Math.random() * width;
    const y = Math.random() * height;

    const inQuietZone =
      x < width * 0.44 && y > height * 0.2 && y < height * 0.74;

    // Carve out a calmer area around the headline block.
    if (inQuietZone && Math.random() < 0.8) continue;

    // Nudge density toward edges/corners so the network frames the content.
    const edgeFactorX = Math.abs(x / width - 0.5) * 2;
    const edgeFactorY = Math.abs(y / height - 0.5) * 2;
    const edgeBias = (edgeFactorX + edgeFactorY) / 2;
    if (Math.random() > 0.45 + edgeBias * 0.55) continue;

    return { x, y };
  }

  return { x: Math.random() * width, y: Math.random() * height };
}

function createNodes(width: number, height: number): Node[] {
  const count = Math.min(92, Math.max(28, Math.round(width * height * NODE_DENSITY)));
  return Array.from({ length: count }, (_, index) => {
    const { x, y } = samplePoint(width, height);
    const isHub = index < Math.round(count * HUB_RATIO);

    return {
      x,
      y,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: isHub ? 4.8 + Math.random() * 2.6 : 2 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      layer: isHub ? "hub" : "regular",
    };
  });
}

function readGraphTokens() {
  const root = getComputedStyle(document.documentElement);
  const num = (name: string, fallback: number) => {
    const raw = root.getPropertyValue(name).trim();
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    stroke:
      root.getPropertyValue("--graph-stroke").trim() ||
      root.getPropertyValue("--accent").trim() ||
      "#34d97e",
    node:
      root.getPropertyValue("--graph-node").trim() ||
      root.getPropertyValue("--accent").trim() ||
      "#34d97e",
    edgeOpacity: num("--graph-edge-opacity", 0.18),
    nodeOpacityMin: num("--graph-node-opacity-min", 0.35),
    nodeOpacityRange: num("--graph-node-opacity-range", 0.4),
  };
}

export default function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let nodes: Node[] = [];
    let width = 0;
    let height = 0;
    let rafId = 0;
    const mouse = { x: -1000, y: -1000 };
    const cursorNode = { x: -1000, y: -1000 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Phones fire `resize` every time the URL bar hides or shows while
      // scrolling. The canvas box does not change then (the hero is svh-sized),
      // so keep the network instead of rebuilding it mid-scroll.
      if (rect.width === width && rect.height === height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = createNodes(width, height);
      // Resizing clears the canvas, and without the loop nothing repaints it.
      if (prefersReducedMotion) drawFrame(0);
    };

    const drawFrame = (time: number) => {
      const tokens = readGraphTokens();
      ctx.clearRect(0, 0, width, height);

      ctx.lineWidth = document.documentElement.dataset.theme === "light" ? 2.6 : 2;
      const all = [...nodes, cursorNode];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const dx = all[i].x - all[j].x;
          const dy = all[i].y - all[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DISTANCE) {
            ctx.globalAlpha = (1 - dist / LINK_DISTANCE) * tokens.edgeOpacity;
            ctx.strokeStyle = tokens.stroke;
            ctx.beginPath();
            ctx.moveTo(all[i].x, all[i].y);
            ctx.lineTo(all[j].x, all[j].y);
            ctx.stroke();
          }
        }
      }

      for (const node of nodes) {
        const pulse = 0.55 + 0.45 * Math.sin(time / 900 + node.phase);
        const baseOpacity =
          tokens.nodeOpacityMin +
          tokens.nodeOpacityRange * pulse +
          (node.layer === "hub" ? 0.12 : 0);
        ctx.globalAlpha = Math.min(1, baseOpacity);
        ctx.fillStyle = tokens.node;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    let lastTime = 0;
    const step = (time: number) => {
      // Speeds are tuned per 60 Hz frame. Scaling by elapsed time keeps the
      // drift the same on 120 Hz phones and in low-power mode (30 Hz); the cap
      // stops a jump after the tab was in the background.
      const frames = lastTime ? Math.min((time - lastTime) / (1000 / 60), 3) : 1;
      lastTime = time;
      for (const node of nodes) {
        node.x += node.vx * frames;
        node.y += node.vy * frames;
        // Turn back only when heading further out, so a node past the edge
        // (after an uneven frame) cannot flip back and forth out there.
        if ((node.x < 0 && node.vx < 0) || (node.x > width && node.vx > 0)) node.vx *= -1;
        if ((node.y < 0 && node.vy < 0) || (node.y > height && node.vy > 0)) node.vy *= -1;
      }
      const ease = Math.min(1, 0.08 * frames);
      cursorNode.x += (mouse.x - cursorNode.x) * ease;
      cursorNode.y += (mouse.y - cursorNode.y) * ease;

      drawFrame(time);
      rafId = requestAnimationFrame(step);
    };

    const onPointerMove = (e: PointerEvent) => {
      // Mouse only: a scrolling finger would drag the links along with it and
      // leave them stuck where it lifted.
      if (e.pointerType !== "mouse") return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    // Re-read graph tokens when the theme toggles.
    const onThemeChange = () => {
      if (prefersReducedMotion) drawFrame(0);
    };
    const themeObserver = new MutationObserver(onThemeChange);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    resize();
    window.addEventListener("resize", resize);

    // With reduced motion, resize() has already painted the one still frame.
    if (!prefersReducedMotion) {
      window.addEventListener("pointermove", onPointerMove);
      rafId = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(rafId);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [prefersReducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    />
  );
}
