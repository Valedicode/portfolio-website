/**
 * Link-preview image (1200×630), generated at build time from cv.json so it
 * always matches the site. Colours mirror the dark theme tokens in
 * globals.css.
 */
import { ImageResponse } from "next/og";
import { CV } from "@/lib/knowledge";

export const alt = `${CV.name}: ${CV.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0a0c0b";
const FG = "#e6ede9";
const MUTED = "#8a998f";
const ACCENT = "#34d97e";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: BG,
          color: FG,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 24, color: ACCENT }}>{CV.role}</div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700, marginTop: 24 }}>
          {CV.name}
          <span style={{ color: ACCENT }}>.</span>
        </div>
        <div style={{ fontSize: 44, color: MUTED, marginTop: 16, maxWidth: 980 }}>
          {CV.tagline}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: MUTED, marginTop: 56 }}>
          <span style={{ color: ACCENT, marginRight: 14 }}>●</span>
          Ask my agents about my work
        </div>
      </div>
    ),
    size,
  );
}
