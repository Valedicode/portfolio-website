"use client";

/**
 * Mounts the play-mode stage while play mode is on. The stage (and with it
 * three.js) is only downloaded the first time a visitor switches it on.
 */
import dynamic from "next/dynamic";
import { usePlayMode } from "./store";

const PlayStage = dynamic(() => import("./PlayStage"), { ssr: false });

export default function PlayMode() {
  const on = usePlayMode();
  return on ? <PlayStage /> : null;
}
