/**
 * The play-mode agent as a small Three.js scene: a 3D take on the Planner
 * mascot (public/agents/planner.png) built from primitives, so there is no
 * model file to download.
 *
 * This module only knows how to draw and animate the character. Where it
 * stands on the page, what it says and how it is steered live in
 * PlayStage.tsx, which calls update() once per frame.
 *
 * Everything is procedural: a walk cycle driven by speed, springs for the
 * squash-and-stretch and the antenna, and a handful of idle habits (blinking,
 * following the cursor, glancing at its map) so it reads as a character
 * rather than a prop.
 */
import {
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from "three";

/** CSS size of the canvas the agent is drawn into. */
export const STAGE_W = 168;
export const STAGE_H = 210;

/** World units visible from top to bottom of the canvas. */
const VIEW_HEIGHT = 4.4;
/** Narrow lens, far away: little perspective distortion on a small figure. */
const FOV = 26;
/** How far the camera looks down on the agent, so it reads as standing on the page. */
const CAMERA_TILT = 0.28;
/** Height the camera aims at; above the figure's middle to leave room to jump. */
const LOOK_AT_Y = 1.95;
/** Feet to antenna tip, in world units. */
const FIGURE_UNITS = 2.9;

const HALF_FOV_TAN = Math.tan((FOV * Math.PI) / 360);
const CAMERA_DISTANCE = VIEW_HEIGHT / (2 * HALF_FOV_TAN);

/** Canvas y (CSS px from the top) of a point at the given height on the agent's axis. */
function canvasY(worldY: number) {
  const offset = worldY - LOOK_AT_Y;
  const depth = CAMERA_DISTANCE - offset * Math.sin(CAMERA_TILT);
  const ndc = (offset * Math.cos(CAMERA_TILT)) / (depth * HALF_FOV_TAN);
  return ((1 - ndc) / 2) * STAGE_H;
}

/** Where the feet sit in the canvas, so the stage can stand the agent on a page point. */
export const FEET_Y = canvasY(0);
/** On-screen height of the figure in CSS px, feet to antenna tip. */
export const FIGURE_H = FEET_Y - canvasY(FIGURE_UNITS);

const GRAVITY = 22;
const JUMP_SPEED = 6.6;

const GREEN = 0x34d97e;

export interface RobotFrame {
  /** Seconds since the previous frame. */
  dt: number;
  /** Seconds since the stage started. */
  time: number;
  /** Walk direction on screen (x right, y down), length 0..1. */
  moveX: number;
  moveY: number;
  /** Where the cursor is relative to the agent, each -1..1 (y down). */
  lookX: number;
  lookY: number;
  talking: boolean;
  /** 0..1: how hard the page scroll is dragging the agent along. */
  carry: number;
}

export interface Robot {
  /** The canvas the agent is drawn into; the caller places it in the page. */
  canvas: HTMLCanvasElement;
  /** Draws one frame. Returns how far the agent is off the ground, in CSS px. */
  update(frame: RobotFrame): number;
  jump(): void;
  wave(): void;
  /** Light pages get a dark contact shadow, dark pages a green under-glow. */
  setLightTheme(light: boolean): void;
  dispose(): void;
}

type GestureKind = "tilt" | "peek" | "antenna";

function damp(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Signed shortest way round from 0 to the given angle. */
function shortestAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Soft round blob used under the feet (tinted by its material colour). */
function blobTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/** The Planner's holographic map: a translucent panel with a plotted route. */
function mapTexture() {
  const w = 160;
  const h = 120;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgba(52,217,126,0.3)";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(125,255,181,0.28)";
  ctx.lineWidth = 2;
  for (let x = 32; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 30; y < h; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const route: [number, number][] = [
    [26, 92],
    [58, 58],
    [98, 74],
    [132, 30],
  ];
  ctx.strokeStyle = "rgba(190,255,220,0.95)";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  route.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.fillStyle = "rgba(230,255,240,1)";
  for (const [x, y] of route) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(125,255,181,0.95)";
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, w, h);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Builds the scene on a canvas of its own. A fresh canvas per call matters:
 * dispose() gives the WebGL context back, and a canvas cannot get a second
 * one. Throws if WebGL is unavailable.
 *
 * `calm` (prefers-reduced-motion) keeps the motion the visitor drives
 * themselves and drops the decorative extras.
 */
export function createRobot(calm: boolean): Robot {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.display = "block";
  canvas.style.width = `${STAGE_W}px`;
  canvas.style.height = `${STAGE_H}px`;

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(STAGE_W, STAGE_H, false);

  const scene = new Scene();

  const camera = new PerspectiveCamera(FOV, STAGE_W / STAGE_H, 0.1, 40);
  camera.position.set(
    0,
    LOOK_AT_Y + Math.sin(CAMERA_TILT) * CAMERA_DISTANCE,
    Math.cos(CAMERA_TILT) * CAMERA_DISTANCE
  );
  camera.lookAt(new Vector3(0, LOOK_AT_Y, 0));

  // A dark figure on a dark page needs its edges lit: one white key from the
  // front, two rims from behind (the green one is the mascot's signature glow).
  scene.add(new HemisphereLight(0xffffff, 0x0b1a12, 1.25));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(2.5, 5, 6);
  scene.add(key);
  const rimGreen = new DirectionalLight(GREEN, 3.4);
  rimGreen.position.set(-4, 2.5, -4);
  scene.add(rimGreen);
  const rimCool = new DirectionalLight(0xbfffe0, 1.8);
  rimCool.position.set(4, 3.5, -3);
  scene.add(rimCool);

  /* ---------- materials and bookkeeping ---------- */

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const textures: Texture[] = [];

  const track = <M extends Material>(material: M) => {
    materials.push(material);
    return material;
  };

  const shell = track(
    new MeshStandardMaterial({ color: 0x20272a, roughness: 0.42, metalness: 0.35 })
  );
  const visorMat = track(
    new MeshStandardMaterial({ color: 0x060909, roughness: 0.14, metalness: 0.7 })
  );
  const glow = track(new MeshBasicMaterial({ color: 0x4dee96 }));
  const antennaGlow = track(new MeshBasicMaterial({ color: GREEN }));

  function add(
    parent: Object3D,
    geometry: BufferGeometry,
    material: Material,
    position: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1]
  ) {
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }

  function pivot(parent: Object3D, x: number, y: number, z: number) {
    const group = new Group();
    group.position.set(x, y, z);
    parent.add(group);
    return group;
  }

  /* ---------- the figure (faces +z, feet at y = 0) ---------- */

  const root = new Group();
  scene.add(root);

  // Contact shadow / under-glow: stays on the ground when the agent jumps.
  const blob = blobTexture();
  textures.push(blob);
  const shadowMat = track(
    new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, color: GREEN })
  );
  const shadowGeometry = new CircleGeometry(0.95, 40);
  geometries.push(shadowGeometry);
  const shadow = new Mesh(shadowGeometry, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  shadow.renderOrder = -1;
  scene.add(shadow);
  let shadowOpacity = 0.34;

  function buildLeg(x: number) {
    const leg = pivot(root, x, 0.62, 0);
    add(leg, new CapsuleGeometry(0.115, 0.2, 6, 14), shell, [0, -0.24, 0]);
    add(leg, new SphereGeometry(0.19, 20, 14), shell, [0, -0.47, 0.06], [1, 0.72, 1.35]);
    add(leg, new CylinderGeometry(0.17, 0.185, 0.035, 20), glow, [0, -0.595, 0.06], [1, 1, 1.35]);
    return leg;
  }
  const legL = buildLeg(0.24);
  const legR = buildLeg(-0.24);

  const TORSO_Y = 0.98;
  const torso = pivot(root, 0, TORSO_Y, 0);
  add(torso, new SphereGeometry(0.5, 32, 24), shell, [0, 0, 0], [1, 1.06, 0.9]);
  // Chest emblem.
  add(torso, new TorusGeometry(0.1, 0.022, 10, 28), glow, [0, 0.05, 0.445]);
  add(torso, new SphereGeometry(0.045, 12, 10), glow, [0, 0.05, 0.45]);
  // Backpack, so the agent is not featureless when it walks away from you.
  add(torso, new SphereGeometry(0.27, 20, 16), shell, [0, 0.03, -0.38], [1, 0.95, 0.55]);
  add(torso, new CapsuleGeometry(0.02, 0.2, 4, 8), glow, [0, 0.03, -0.535]).rotation.z =
    Math.PI / 2;

  function buildArm(x: number) {
    const arm = pivot(torso, x, 0.2, 0);
    add(arm, new CapsuleGeometry(0.095, 0.3, 6, 12), shell, [0, -0.24, 0]);
    add(arm, new SphereGeometry(0.135, 18, 14), shell, [0, -0.5, 0]);
    return arm;
  }
  /** Carries the map (the viewer's right when the agent faces the camera). */
  const mapArm = buildArm(0.5);
  /** Swings, gestures and waves. */
  const freeArm = buildArm(-0.5);

  const MAP_ARM_REST = -1.0;
  const mapTex = mapTexture();
  textures.push(mapTex);
  const mapMat = track(
    new MeshBasicMaterial({
      map: mapTex,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    })
  );
  const map = add(mapArm, new PlaneGeometry(0.56, 0.42), mapMat, [-0.2, -0.64, 0.1]);
  // Cancel most of the arm's forward swing so the panel faces the viewer,
  // tipped back a little like something being read.
  map.rotation.set(-MAP_ARM_REST - 0.5, -0.25, 0);

  const head = pivot(torso, 0, 0.47, 0);
  add(head, new SphereGeometry(0.62, 40, 28), shell, [0, 0.5, 0], [1.1, 0.94, 1]);
  add(head, new SphereGeometry(0.5, 32, 20), visorMat, [0, 0.48, 0.35], [1.1, 0.74, 0.62]);

  const FACE_Y = 0.48;
  const EYE_HEIGHT = 1.4;
  const face = pivot(head, 0, FACE_Y, 0);
  const eyeGeometry = new SphereGeometry(0.105, 20, 14);
  const eyes = [0.215, -0.215].map((x) => {
    const eye = add(face, eyeGeometry, glow, [x, 0, 0.635], [0.95, EYE_HEIGHT, 0.3]);
    eye.rotation.y = x > 0 ? 0.32 : -0.32;
    return eye;
  });

  for (const side of [1, -1]) {
    add(head, new CylinderGeometry(0.17, 0.17, 0.12, 24), shell, [side * 0.69, 0.48, 0]).rotation.z =
      Math.PI / 2;
    add(head, new TorusGeometry(0.105, 0.024, 10, 28), glow, [side * 0.755, 0.48, 0]).rotation.y =
      Math.PI / 2;
  }

  const antenna = pivot(head, 0, 1.07, 0);
  add(antenna, new CylinderGeometry(0.022, 0.03, 0.26, 10), shell, [0, 0.12, 0]);
  add(antenna, new SphereGeometry(0.078, 16, 12), antennaGlow, [0, 0.29, 0]);
  const antennaBase = new Color(GREEN);
  const antennaBright = new Color(0xe6fff1);

  /* ---------- animation state ---------- */

  let yaw = 0;
  let yawTarget = 0;
  let stillFor = 0;
  let walk = 0;
  let phase = 0;

  let height = 0;
  let fallSpeed = 0;
  let airborne = false;
  let air = 0;
  let squash = 0;
  let squashSpeed = 0;

  let headYaw = 0;
  let headPitch = 0;
  let talk = 0;
  let carry = 0;

  let waveLeft = 0;
  let waving = 0;

  let antennaAngle = 0;
  let antennaSpeed = 0;

  let blinkIn = 1.2;
  let blinkFor = 0;
  const BLINK_LENGTH = 0.16;

  let gesture: { kind: GestureKind; progress: number; length: number; side: number } | null =
    null;
  let gestureIn = 3;
  const GESTURES: GestureKind[] = ["tilt", "peek", "antenna", "peek"];

  function update(frame: RobotFrame) {
    const { dt, time } = frame;
    const speed = Math.min(1, Math.hypot(frame.moveX, frame.moveY));
    walk = damp(walk, speed, 10, dt);
    const idle = 1 - walk;

    // Turn to face where it is going; turn back to the viewer once it stops.
    if (speed > 0.05) {
      yawTarget = Math.atan2(frame.moveX, frame.moveY);
      stillFor = 0;
    } else {
      stillFor += dt;
      if (stillFor > 0.45) yawTarget = 0;
    }
    yaw += shortestAngle(yawTarget - yaw) * (1 - Math.exp(-11 * dt));

    phase += dt * 13 * walk;
    const swing = Math.sin(phase);
    const bob = Math.abs(swing) * 0.07 * walk;

    // Jump arc, plus a spring that stretches on take-off and squashes on landing.
    if (airborne) {
      fallSpeed -= GRAVITY * dt;
      height += fallSpeed * dt;
      if (height <= 0) {
        height = 0;
        airborne = false;
        squashSpeed -= 5.5;
        antennaSpeed -= 7;
      }
    }
    air = damp(air, airborne ? 1 : 0, 14, dt);
    squashSpeed += (-170 * squash - 15 * squashSpeed) * dt;
    squash = Math.max(-0.3, Math.min(0.3, squash + squashSpeed * dt));

    talk = damp(talk, frame.talking ? 1 : 0, 8, dt);
    carry = damp(carry, calm ? 0 : Math.max(0, Math.min(1, frame.carry)), 7, dt);

    // Idle habits: only when standing around with nothing else going on.
    if (gesture) {
      gesture.progress += dt / gesture.length;
      if (gesture.progress >= 1) gesture = null;
    } else if (!calm && idle > 0.9 && !frame.talking && !airborne && carry < 0.1) {
      gestureIn -= dt;
      if (gestureIn <= 0) {
        gesture = {
          kind: GESTURES[Math.floor(Math.random() * GESTURES.length)],
          progress: 0,
          length: 1.4 + Math.random() * 0.8,
          side: Math.random() < 0.5 ? 1 : -1,
        };
        gestureIn = 3.5 + Math.random() * 4;
      }
    }
    const envelope = gesture ? Math.sin(Math.PI * gesture.progress) * idle : 0;
    const doing = (kind: GestureKind) => (gesture?.kind === kind ? envelope : 0);

    /* ----- body ----- */

    const breath = calm ? 0 : Math.sin(time * 2.1) * 0.012;
    root.position.y = height + bob + carry * 0.22;
    // Euler order is XYZ, so z here sways the figure in screen space.
    root.rotation.set(0, yaw, Math.sin(time * 7.5) * 0.09 * carry);
    root.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);

    torso.position.y = TORSO_Y + breath;
    torso.scale.y = 1 + breath;
    torso.rotation.set(0.14 * walk, 0, swing * 0.045 * walk);

    const dangle = carry * 0.35;
    const kick = Math.sin(time * 8) * 0.25 * carry;
    legL.rotation.set(swing * 0.75 * walk + dangle + kick, 0, air * 0.25);
    legR.rotation.set(-swing * 0.75 * walk + dangle - kick, 0, -air * 0.25);

    /* ----- head and face ----- */

    // Follow the cursor only while facing the viewer; from behind it would
    // mean turning the head through the body.
    const facing = Math.max(0, Math.cos(yaw)) * idle;
    headYaw = damp(headYaw, frame.lookX * 0.6 * facing + doing("peek") * 0.45, 9, dt);
    headPitch = damp(headPitch, frame.lookY * 0.32 * facing + doing("peek") * 0.4, 9, dt);
    head.rotation.set(
      headPitch + Math.sin(time * 9) * 0.03 * talk,
      headYaw,
      doing("tilt") * 0.24 * (gesture?.side ?? 1)
    );
    face.position.set(frame.lookX * 0.05 * facing, FACE_Y - frame.lookY * 0.03 * facing, 0);

    blinkIn -= dt;
    if (blinkIn <= 0 && blinkFor <= 0) {
      blinkFor = BLINK_LENGTH;
      // Now and then, a quick double blink.
      blinkIn = Math.random() < 0.18 ? 0.26 : 2.4 + Math.random() * 3.2;
    }
    let lid = 0;
    if (blinkFor > 0) {
      blinkFor -= dt;
      const p = 1 - Math.max(0, blinkFor) / BLINK_LENGTH;
      lid = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
    }
    const wide = 1 + 0.14 * Math.max(carry, air);
    for (const eye of eyes) eye.scale.y = EYE_HEIGHT * wide * (1 - 0.92 * lid);

    /* ----- arms ----- */

    if (waveLeft > 0) waveLeft -= dt;
    waving = damp(waving, waveLeft > 0 ? 1 : 0, 12, dt);

    // Free arm: swings against the legs, gestures while talking, flails
    // when carried. Negative z lifts it out to the side.
    const restZ = -0.22 - talk * 0.45 - Math.sin(time * 5.5) * 0.1 * talk - carry * 1.9;
    const restX = swing * 0.7 * walk - talk * 0.55;
    freeArm.rotation.set(
      lerp(restX, 0, waving),
      0,
      lerp(restZ, -2.45 + Math.sin(time * 15) * 0.32, waving)
    );

    mapArm.rotation.set(
      MAP_ARM_REST + swing * 0.12 * walk - doing("peek") * 0.22 + breath * 1.5,
      0,
      0.1 + carry * 0.5
    );

    /* ----- antenna ----- */

    // Underdamped on purpose: it lags behind a walk and wobbles after a stop.
    const stiffness = 140;
    const damping = calm ? 24 : 5.5;
    antennaSpeed += ((-walk * 0.45 - antennaAngle) * stiffness - antennaSpeed * damping) * dt;
    antennaAngle += antennaSpeed * dt;
    antenna.rotation.set(
      antennaAngle + doing("antenna") * Math.sin(time * 30) * 0.3,
      0,
      calm ? 0 : Math.sin(time * 1.7) * 0.04 * idle
    );
    antennaGlow.color
      .copy(antennaBase)
      .lerp(antennaBright, talk * (0.5 + 0.5 * Math.sin(time * 12)));

    /* ----- ground ----- */

    const lifted = height + carry * 0.22;
    shadow.scale.setScalar(Math.max(0.55, 1 - lifted * 0.3));
    shadowMat.opacity = shadowOpacity * Math.max(0.35, 1 - lifted * 0.5);

    renderer.render(scene, camera);
    return lifted * (STAGE_H / VIEW_HEIGHT);
  }

  return {
    canvas,
    update,
    jump() {
      if (airborne) return;
      airborne = true;
      fallSpeed = JUMP_SPEED;
      squashSpeed += 4;
      antennaSpeed += 5;
    },
    wave() {
      waveLeft = 1.3;
    },
    setLightTheme(light) {
      shadowMat.color.set(light ? 0x0d1812 : GREEN);
      shadowOpacity = light ? 0.3 : 0.34;
      // Near-white highlights disappear on a light page: pulse the antenna
      // towards a deeper green instead, and darken the map's ink.
      antennaBright.set(light ? 0x0a7d4a : 0xe6fff1);
      mapMat.color.set(light ? 0x13a05c : 0xffffff);
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      // Browsers cap the number of live WebGL contexts; release this one now
      // rather than whenever the canvas is garbage-collected.
      renderer.forceContextLoss();
    },
  };
}
