"use client";

/**
 * The hero's ambient agent network: lightweight 2D-canvas nodes that
 * drift slowly, link up when close, and quietly pulse — plus one node
 * that eases toward the visitor's cursor.
 *
 * Deliberately not WebGL: ~45 nodes with O(n²) edge checks is cheap.
 * With prefers-reduced-motion a single static frame is drawn instead.
 */
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Phase offset so nodes pulse out of sync. */
  phase: number;
}

const LINK_DISTANCE = 150;
const NODE_DENSITY = 1 / 24_000; // nodes per px² — ~45 nodes at 1440×760

function createNodes(width: number, height: number): Node[] {
  const count = Math.min(70, Math.max(20, Math.round(width * height * NODE_DENSITY)));
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    radius: 1 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
  }));
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
    // Cursor node target; starts offscreen until the pointer moves.
    const mouse = { x: -1000, y: -1000 };
    const cursorNode = { x: -1000, y: -1000 };

    const readAccent = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
      "#34d97e";

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = createNodes(width, height);
    };

    const drawFrame = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const accent = readAccent();

      // Edges: connect nearby nodes; opacity falls off with distance.
      ctx.lineWidth = 1;
      const all = [...nodes, cursorNode];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const dx = all[i].x - all[j].x;
          const dy = all[i].y - all[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DISTANCE) {
            ctx.globalAlpha = (1 - dist / LINK_DISTANCE) * 0.18;
            ctx.strokeStyle = accent;
            ctx.beginPath();
            ctx.moveTo(all[i].x, all[i].y);
            ctx.lineTo(all[j].x, all[j].y);
            ctx.stroke();
          }
        }
      }

      // Nodes, with a slow sinusoidal pulse.
      for (const node of nodes) {
        const pulse = 0.55 + 0.45 * Math.sin(time / 900 + node.phase);
        ctx.globalAlpha = 0.35 + 0.4 * pulse;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const step = (time: number) => {
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        // Bounce softly off the edges.
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
      }
      // The cursor node lags behind the pointer for an organic feel.
      cursorNode.x += (mouse.x - cursorNode.x) * 0.08;
      cursorNode.y += (mouse.y - cursorNode.y) * 0.08;

      drawFrame(time);
      rafId = requestAnimationFrame(step);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    resize();
    window.addEventListener("resize", resize);

    if (prefersReducedMotion) {
      drawFrame(0); // static snapshot, no animation loop
    } else {
      window.addEventListener("pointermove", onPointerMove);
      rafId = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(rafId);
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
