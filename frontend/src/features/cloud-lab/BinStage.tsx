"use client";

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Phase } from "@/features/cloud-lab/model";
import { usePrefs } from "@/shared/lib/prefs";

/* ══ 노이즈 ═══════════════════════════════════════════════════════════ */
const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

/* ══ 상수 ═════════════════════════════════════════════════════════════ */
export type TrashKind = "paper" | "can" | "bottle" | "cup";
const PW = 1.5, PH = 1.95, SX = 40, SY = 52, BALL_R = 0.42;
const BALL_SCALE = 0.62; // 종이공이 되면 이 크기로 줄어든다 (반지름 ≈ 0.26)
const RADIUS: Record<TrashKind, number> = { paper: BALL_R * BALL_SCALE, can: 0.24, bottle: 0.28, cup: 0.24 };
const BIN = { rTop: 0.62, rBottom: 0.48, h: 1.0 };
const RIM_R = 0.08;
const G = -13;

type Layout = {
  w: number; h: number; floor: number;
  paper: THREE.Vector3; paperScale: number; home: THREE.Vector3;
  bin: THREE.Vector3; mouthY: number;
};

function useLayout(): Layout {
  const { viewport } = useThree();
  return useMemo(() => {
    const { width: w, height: h } = viewport;
    const floor = -h / 2 + 0.3;
    const portrait = w < h;
    const bin = new THREE.Vector3(portrait ? w * 0.18 : w * 0.24, floor + BIN.h / 2, 0);
    return {
      w, h, floor, bin, mouthY: bin.y + BIN.h / 2,
      paper: new THREE.Vector3(portrait ? 0 : -w * 0.18, portrait ? h * 0.12 : 0.25, 0),
      paperScale: portrait ? Math.min(1, (w - 0.5) / PW) : 1.15,
      home: new THREE.Vector3(portrait ? -w * 0.22 : -w * 0.22, portrait ? floor + 1.6 : -0.1, 0),
    };
  }, [viewport]);
}

/* ══ 공유 상태 (버튼 → 3D, 물체 ↔ 통) ═════════════════════════════════ */
type Commands = { crumple: boolean; unfold: boolean; auto: boolean; respawn: boolean };
type Shared = { near: number; wobble: number; hop: number };

type Callbacks = {
  onProgress: (p: number) => void;
  onReady: () => void; // 던질 수 있는 상태 (종이공 완성 / 쓰레기 등장)
  onIn: () => void;
  onMiss: () => void;
  onBlocked: () => void;
  onBinScreen?: (x: number, y: number) => void; // 통 입구의 화면 좌표 (구름 연출 위치)
};

/* ══ 쓰레기 모양 ═════════════════════════════════════════════════════ */
function labelTexture(bg: string, fg: string, text: string) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = bg; x.fillRect(0, 0, 512, 256);
  x.fillStyle = fg; x.fillRect(0, 96, 512, 64);
  x.fillStyle = "#ffffff"; x.font = "800 44px sans-serif"; x.textAlign = "center"; x.fillText(text, 256, 142);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function CanMesh() {
  const tex = useMemo(() => labelTexture("#78c8f8", "#ffb84d", "CLOUDLE"), []);
  return (
    <group>
      <mesh><cylinderGeometry args={[0.17, 0.17, 0.44, 40]} /><meshStandardMaterial map={tex} roughness={0.35} metalness={0.5} /></mesh>
      <mesh position={[0, 0.235, 0]}><cylinderGeometry args={[0.155, 0.17, 0.03, 40]} /><meshStandardMaterial color="#d9e2ea" roughness={0.3} metalness={0.8} /></mesh>
      <mesh position={[0, -0.235, 0]}><cylinderGeometry args={[0.17, 0.155, 0.03, 40]} /><meshStandardMaterial color="#c9d3dc" roughness={0.3} metalness={0.8} /></mesh>
    </group>
  );
}

function BottleMesh() {
  const tex = useMemo(() => labelTexture("rgba(0,0,0,0)", "#3e9a63", "PET"), []);
  return (
    <group position={[0, -0.05, 0]}>
      <mesh><cylinderGeometry args={[0.16, 0.16, 0.46, 32]} /><meshStandardMaterial color="#cfeeff" transparent opacity={0.55} roughness={0.15} /></mesh>
      <mesh><cylinderGeometry args={[0.162, 0.162, 0.14, 32, 1, true]} /><meshStandardMaterial map={tex} transparent roughness={0.6} /></mesh>
      <mesh position={[0, 0.28, 0]}><sphereGeometry args={[0.16, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#cfeeff" transparent opacity={0.55} roughness={0.15} /></mesh>
      <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[0.06, 0.07, 0.12, 20]} /><meshStandardMaterial color="#cfeeff" transparent opacity={0.6} /></mesh>
      <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.07, 0.07, 0.06, 20]} /><meshStandardMaterial color="#bce8c8" roughness={0.6} /></mesh>
    </group>
  );
}

function CupMesh() {
  return (
    <group>
      <mesh><cylinderGeometry args={[0.2, 0.14, 0.42, 36, 1, true]} /><meshStandardMaterial color="#ffffff" roughness={0.9} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.182, 0.163, 0.1, 36, 1, true]} /><meshStandardMaterial color="#78c8f8" roughness={0.9} /></mesh>
      <mesh position={[0, -0.205, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.14, 30]} /><meshStandardMaterial color="#f2f6fa" /></mesh>
      <mesh position={[0, 0.21, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.012, 8, 40]} /><meshStandardMaterial color="#ffffff" /></mesh>
    </group>
  );
}

/* ══ 던질 수 있는 물체 (종이·캔·병·컵) ═══════════════════════════════ */
function Throwable({ kind, texture, layout, phase, canCrumple, cmd, shared, cb }: {
  kind: TrashKind; texture: THREE.Texture; layout: Layout; phase: Phase; canCrumple: boolean;
  cmd: React.RefObject<Commands>; shared: React.RefObject<Shared>; cb: Callbacks;
}) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const dark = usePrefs((s) => s.theme === "dark");
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const geo = useMemo(() => new THREE.PlaneGeometry(PW, PH, SX, SY), []);
  const r = RADIUS[kind];

  // 종이: 정점별 평면 위치 · 종이공 위치 · 주름 시드 · 구김도
  const d = useMemo(() => {
    const pos = geo.attributes.position, uv = geo.attributes.uv, n = pos.count;
    const base = new Float32Array(n * 3), ball = new Float32Array(n * 3);
    const wr = new Float32Array(n), c = new Float32Array(n), us = new Float32Array(n), vs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      us[i] = u; vs[i] = v;
      let x = pos.getX(i), y = pos.getY(i);
      const nx = u < 1e-4 ? -1 : u > 1 - 1e-4 ? 1 : 0, ny = v < 1e-4 ? -1 : v > 1 - 1e-4 ? 1 : 0;
      const wob = (noise(u * 11 + v * 7, 3.3) - 0.5) * 0.05;
      x += nx * wob; y += ny * wob;
      base.set([x, y, 0], i * 3);
      const th = u * Math.PI * 2 + (noise(u * 3, v * 3) - 0.5) * 0.9;
      const ph = 0.08 + v * (Math.PI - 0.16) + (noise(v * 4 + 9, u * 4) - 0.5) * 0.5;
      const rr = BALL_R * (0.8 + 0.35 * noise(u * 6 + 1.7, v * 6 + 3.1)) * (0.92 + 0.16 * hash(i, 7));
      ball.set([rr * Math.sin(ph) * Math.cos(th), -rr * Math.cos(ph), rr * Math.sin(ph) * Math.sin(th)], i * 3);
      wr[i] = noise(u * 10, v * 10) - 0.5;
    }
    return { base, ball, wr, c, us, vs, n };
  }, [geo]);

  const st = useRef({
    mode: (kind === "paper" ? "sheet" : "rest") as "sheet" | "rest" | "drag" | "fly" | "settle" | "in" | "gone",
    anim: "none" as "none" | "crumple" | "unfold",
    dragging: false, dirty: true, reported: -1,
    last: new THREE.Vector3(), lastUv: new THREE.Vector2(0.5, 0.5), target: new THREE.Vector3(),
    vel: new THREE.Vector3(), spin: new THREE.Vector3(), hist: [] as { p: THREE.Vector3; t: number }[],
    settleT: 0, inT: 0, squash: 0, prevY: 0,
  });

  const toRest = (g: THREE.Group) => {
    const s = st.current;
    s.mode = "rest"; s.vel.set(0, 0, 0);
    g.visible = true;
    g.position.copy(layout.home).setY(layout.home.y + 1.2);
    g.scale.setScalar(kind === "paper" ? layout.paperScale * BALL_SCALE : 1);
  };

  // 종류가 바뀌거나 흐름이 처음으로 돌아가면 초기화
  useEffect(() => {
    const g = group.current, s = st.current;
    if (!g) return;
    if (phase === "write") {
      if (kind === "paper") {
        s.mode = "sheet"; s.anim = d.c.some((v) => v > 0) ? "unfold" : "none";
        g.visible = true; g.position.copy(layout.paper); g.rotation.set(0, 0, -0.04); g.scale.setScalar(layout.paperScale);
      }
    }
    if (phase === "ball" && s.mode !== "rest" && s.mode !== "drag" && s.mode !== "fly" && s.mode !== "settle" && kind !== "paper") {
      toRest(g);
      cb.onReady();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, kind, layout]);

  useFrame((state, dt) => {
    const g = group.current, s = st.current, k = cmd.current, sh = shared.current;
    if (!g || !k || !sh) return;
    dt = Math.min(dt, 1 / 30);

    /* 명령 */
    if (k.crumple) { k.crumple = false; if (s.mode === "sheet") { if (canCrumple) s.anim = "crumple"; else cb.onBlocked(); } }
    if (k.unfold) { k.unfold = false; if (kind === "paper" && (s.mode === "sheet" || s.mode === "rest")) { s.mode = "sheet"; s.anim = "unfold"; g.scale.setScalar(layout.paperScale); } }
    if (k.respawn) { k.respawn = false; toRest(g); }
    if (k.auto) {
      k.auto = false;
      if (s.mode === "rest" || s.mode === "settle") {
        // 통 입구 바로 위를 지나 떨어지도록 포물선 초기 속도 계산
        const T = 0.95, tx = layout.bin.x, ty = layout.mouthY - 0.15;
        s.vel.set((tx - g.position.x) / T, (ty - g.position.y - 0.5 * G * T * T) / T, 0);
        s.spin.set(4, 6, 2); s.mode = "fly";
      }
    }

    /* 종이 구김 */
    if (kind === "paper" && s.mode === "sheet") {
      if (s.anim === "crumple") {
        let done = true;
        for (let i = 0; i < d.n; i++) { d.c[i] = Math.min(1, d.c[i] + dt * (1.4 + d.wr[i])); if (d.c[i] < 1) done = false; }
        s.dirty = true; if (done) s.anim = "none";
      } else if (s.anim === "unfold") {
        let done = true;
        for (let i = 0; i < d.n; i++) { d.c[i] = Math.max(0, d.c[i] - dt * 1.8); if (d.c[i] > 0) done = false; }
        s.dirty = true; if (done) s.anim = "none";
      }
    }
    if (kind === "paper" && s.dirty) {
      let sum = 0, min = 1;
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < d.n; i++) {
        const ci = d.c[i], e = smooth(ci), j = i * 3, wrk = Math.sin(Math.PI * ci) * d.wr[i] * 0.32;
        sum += ci; if (ci < min) min = ci;
        p.setXYZ(i, d.base[j] + (d.ball[j] - d.base[j]) * e + wrk * 0.25,
          d.base[j + 1] + (d.ball[j + 1] - d.base[j + 1]) * e - wrk * 0.2, d.ball[j + 2] * e + wrk);
      }
      p.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere(); s.dirty = false;
      const mean = sum / d.n;
      if (Math.abs(mean - s.reported) > 0.02) { s.reported = mean; cb.onProgress(mean); }
      if (s.mode === "sheet" && s.anim !== "unfold" && mean > 0.8 && min < 1) s.anim = "crumple";
      if (s.mode === "sheet" && min >= 1) { s.mode = "rest"; cb.onReady(); }
    }

    /* 물리 */
    const binX = layout.bin.x, mouth = layout.mouthY, bottom = layout.bin.y - BIN.h / 2;
    if (s.mode === "sheet") {
      g.position.lerp(layout.paper, 1 - Math.exp(-6 * dt));
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0, 4, dt);
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, 0, 3, dt);
    } else if (s.mode === "rest") {
      // 종이공 크기로 줄어들며 대기 위치로, 살짝 둥실
      const target = layout.home.clone().setY(layout.home.y + Math.sin(state.clock.elapsedTime * 2) * 0.05);
      g.position.lerp(target, 1 - Math.exp(-5 * dt));
      const sc = kind === "paper" ? layout.paperScale * BALL_SCALE : 1;
      g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, sc, 6, dt));
      g.rotation.y += dt * 0.6;
    } else if (s.mode === "drag") {
      g.position.lerp(s.target, 1 - Math.exp(-22 * dt));
      s.hist.push({ p: g.position.clone(), t: state.clock.elapsedTime });
      while (s.hist.length > 8) s.hist.shift();
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -0.3, 6, dt);
    } else if (s.mode === "fly" || s.mode === "settle") {
      s.prevY = g.position.y;
      s.vel.y += G * dt;
      g.position.addScaledVector(s.vel, dt);
      g.rotation.x += s.spin.x * dt; g.rotation.y += s.spin.y * dt; g.rotation.z += s.spin.z * dt;
      // 통 입구 테두리 (양쪽 끝 원)와 충돌 → 튕김
      for (const sx of [-1, 1]) {
        const rim = new THREE.Vector2(binX + sx * BIN.rTop, mouth);
        const dv = new THREE.Vector2(g.position.x - rim.x, g.position.y - rim.y);
        const dist = dv.length();
        if (dist < r + RIM_R && dist > 1e-4) {
          const nrm = dv.divideScalar(dist);
          g.position.x = rim.x + nrm.x * (r + RIM_R); g.position.y = rim.y + nrm.y * (r + RIM_R);
          const vn = s.vel.x * nrm.x + s.vel.y * nrm.y;
          if (vn < 0) { s.vel.x -= 1.6 * vn * nrm.x; s.vel.y -= 1.6 * vn * nrm.y; s.vel.multiplyScalar(0.75); }
          s.squash = 1; sh.wobble = Math.max(sh.wobble, 0.4);
        }
      }
      // 통 바깥 벽
      if (g.position.y < mouth && g.position.y > bottom) {
        const t = (g.position.y - bottom) / BIN.h, wall = BIN.rBottom + (BIN.rTop - BIN.rBottom) * t;
        const dx = g.position.x - binX;
        if (Math.abs(dx) < wall + r && Math.abs(dx) > wall - r * 0.5 && s.prevY < mouth + 0.01 && !(Math.abs(dx) < BIN.rTop - r * 0.6 && s.prevY >= mouth)) {
          g.position.x = binX + Math.sign(dx) * (wall + r);
          s.vel.x = Math.abs(s.vel.x) * Math.sign(dx) * 0.5;
        }
      }
      // 입구로 쏙
      if (s.prevY >= mouth && g.position.y < mouth && Math.abs(g.position.x - binX) < BIN.rTop - r * 0.6) {
        s.mode = "in"; s.inT = 0; sh.hop = 1; sh.wobble = 1;
      }
      // 화면 벽
      const half = layout.w / 2 - r;
      if (g.position.x < -half) { g.position.x = -half; s.vel.x = Math.abs(s.vel.x) * 0.6; }
      if (g.position.x > half) { g.position.x = half; s.vel.x = -Math.abs(s.vel.x) * 0.6; }
      // 바닥 → 통통 튀고 구르다 멈추면 제자리로
      if (g.position.y < layout.floor + r) {
        g.position.y = layout.floor + r;
        if (Math.abs(s.vel.y) > 1.2) { s.vel.y = -s.vel.y * 0.42; s.squash = 1; } else s.vel.y = 0;
        s.vel.x *= 0.86; s.spin.multiplyScalar(0.9);
        if (s.mode === "fly") { s.mode = "settle"; s.settleT = 0; }
      }
      if (s.mode === "settle") {
        s.settleT += dt;
        if (s.settleT > 1.1 && s.vel.length() < 0.8) { cb.onMiss(); s.mode = "rest"; }
      }
    } else if (s.mode === "in") {
      s.inT += dt;
      const t = Math.min(1, s.inT / 0.35);
      g.position.x = THREE.MathUtils.lerp(g.position.x, binX, 0.25);
      g.position.y = mouth - t * (BIN.h * 0.6);
      g.scale.multiplyScalar(0.97);
      if (t >= 1) { s.mode = "gone"; g.visible = false; cb.onIn(); }
    }
    // 착지 찌그러짐 (squash & stretch)
    s.squash = Math.max(0, s.squash - dt * 5);
    const base = g.scale.x;
    g.scale.y = base * (1 - 0.18 * Math.sin(Math.PI * s.squash));

    // 다가오는 물체에 통이 반응
    const dist = Math.hypot(g.position.x - binX, g.position.y - mouth);
    sh.near = s.mode === "drag" || s.mode === "fly" ? Math.max(0, 1 - dist / 1.8) : 0;

    // 바닥 그림자
    if (shadow.current) {
      const hgt = Math.max(0, g.position.y - layout.floor);
      shadow.current.visible = g.visible && s.mode !== "sheet";
      shadow.current.position.set(g.position.x, layout.floor + 0.01, 0.3);
      const sc = Math.max(0.2, 1 - hgt * 0.25) * r * 2.4;
      shadow.current.scale.set(sc, sc * 0.35, 1);
      (shadow.current.material as THREE.MeshBasicMaterial).opacity = 0.18 * Math.max(0.2, 1 - hgt * 0.3);
    }
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    e.stopPropagation();
    if (s.mode === "sheet") {
      if (!canCrumple) return cb.onBlocked();
      s.dragging = true; s.anim = "none"; s.last.copy(e.point);
      if (e.uv) s.lastUv.copy(e.uv);
    } else if (s.mode === "rest" || s.mode === "settle") {
      s.mode = "drag"; s.dragging = true; s.hist = [];
      e.ray.intersectPlane(plane, s.target);
    } else return;
    (e.target as unknown as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    if (!s.dragging) return;
    if (s.mode === "sheet") {
      const dist = e.point.distanceTo(s.last);
      s.last.copy(e.point);
      if (e.uv) s.lastUv.copy(e.uv);
      for (let i = 0; i < d.n; i++) {
        const du = d.us[i] - s.lastUv.x, dv = d.vs[i] - s.lastUv.y;
        d.c[i] = Math.min(1, d.c[i] + dist * (0.9 * Math.exp(-(du * du + dv * dv) / 0.05) + 0.1));
      }
      s.dirty = true;
    } else if (s.mode === "drag") {
      e.ray.intersectPlane(plane, s.target);
      s.target.y = Math.max(s.target.y, layout.floor + r);
    }
  };

  const up = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
    if (s.mode === "drag") {
      // 놓기 직전 움직임으로 던지는 속도 계산 (플릭)
      const h = s.hist;
      if (h.length >= 2) {
        const a = h[0], b = h[h.length - 1], dtt = Math.max(1 / 120, b.t - a.t);
        s.vel.set((b.p.x - a.p.x) / dtt, (b.p.y - a.p.y) / dtt, 0).clampLength(0, 15);
      } else s.vel.set(0, 0, 0);
      s.spin.set(s.vel.y * 2, s.vel.x * 2, -s.vel.x);
      s.mode = "fly";
    }
  };

  const paperColor = dark ? "#d9dde6" : "#ffffff";
  return (
    <>
      <group ref={group} position={kind === "paper" ? layout.paper : layout.home} scale={kind === "paper" ? layout.paperScale : 1}>
        {/* 잡기 쉽게 투명한 판정 구를 둔다 (종이 상태에선 종이 자체로 판정) */}
        {kind === "paper" ? (
          <mesh geometry={geo} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onPointerOver={() => (document.body.style.cursor = "grab")} onPointerOut={() => (document.body.style.cursor = "")}>
            <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.95} flatShading color={paperColor} />
          </mesh>
        ) : (
          <>
            {kind === "can" && <CanMesh />}
            {kind === "bottle" && <BottleMesh />}
            {kind === "cup" && <CupMesh />}
            <mesh onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              onPointerOver={() => (document.body.style.cursor = "grab")} onPointerOut={() => (document.body.style.cursor = "")}>
              <sphereGeometry args={[r * 1.5, 12, 12]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </>
        )}
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial color="#25354d" transparent opacity={0.15} depthWrite={false} />
      </mesh>
    </>
  );
}

/* ══ 클라우드 빈 (구름 테두리 · 얼굴 · 구름 뚜껑) ═════════════════════ */
function CloudBin({ layout, phase, shared, cb }: { layout: Layout; phase: Phase; shared: React.RefObject<Shared>; cb: Callbacks }) {
  const g = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const puffs = useRef<THREE.Group>(null);
  const dark = usePrefs((s) => s.theme === "dark");
  const { camera, size } = useThree();
  const body = useMemo(() => {
    // 아래가 둥근 통 실루엣 (LatheGeometry)
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(BIN.rBottom * 0.6 + Math.sin((t * Math.PI) / 2) * BIN.rBottom * 0.4, -BIN.h / 2 + (1 - Math.cos((t * Math.PI) / 2)) * 0.18));
    }
    pts.push(new THREE.Vector2(BIN.rTop, BIN.h / 2));
    return new THREE.LatheGeometry(pts, 48);
  }, []);
  const closed = phase === "analyzing";
  const lastScreen = useRef("");

  useFrame((state, dt) => {
    const grp = g.current, sh = shared.current;
    if (!grp || !sh) return;
    const t = state.clock.elapsedTime;
    sh.wobble = Math.max(0, sh.wobble - dt * 1.4);
    sh.hop = Math.max(0, sh.hop - dt * 2.2);
    grp.rotation.z = Math.sin(t * 22) * 0.07 * sh.wobble;
    grp.position.y = layout.bin.y + Math.sin(Math.PI * sh.hop) * 0.18;
    const sq = 1 + 0.08 * Math.sin(Math.PI * sh.hop * 2);
    grp.scale.set(sq, 2 - sq, sq);
    if (puffs.current) puffs.current.scale.setScalar(THREE.MathUtils.damp(puffs.current.scale.x, 1 + sh.near * 0.18, 8, dt));
    if (lid.current) {
      // 뚜껑은 분석할 때만 위에서 내려와 닫힌다
      lid.current.rotation.x = THREE.MathUtils.damp(lid.current.rotation.x, closed ? 0 : -0.9, 5, dt);
      const ls = THREE.MathUtils.damp(lid.current.scale.x, closed ? 1 : 0.001, 7, dt);
      lid.current.scale.setScalar(ls);
      lid.current.visible = ls > 0.02;
    }
    // 구름 연출 DOM을 통 위에 맞추기 위해 화면 좌표 보고
    const p = new THREE.Vector3(layout.bin.x, layout.mouthY, 0).project(camera);
    const key = `${Math.round((p.x + 1) * 50)}:${Math.round((1 - p.y) * 50)}:${size.width}`;
    if (key !== lastScreen.current) {
      lastScreen.current = key;
      cb.onBinScreen?.((p.x + 1) / 2, (1 - p.y) / 2);
    }
  });

  const tub = dark ? "#4d7aa0" : "#a9dcfb";
  const puff = dark ? "#dfe8f0" : "#ffffff";
  return (
    <group ref={g} position={layout.bin}>
      <mesh geometry={body}><meshStandardMaterial color={tub} roughness={0.85} side={THREE.DoubleSide} /></mesh>
      {/* 얼굴 */}
      <mesh position={[-0.17, 0.02, 0.56]}><sphereGeometry args={[0.045, 16, 16]} /><meshStandardMaterial color="#25354d" /></mesh>
      <mesh position={[0.17, 0.02, 0.56]}><sphereGeometry args={[0.045, 16, 16]} /><meshStandardMaterial color="#25354d" /></mesh>
      <mesh position={[0, -0.09, 0.57]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.07, 0.016, 8, 20, Math.PI]} /><meshStandardMaterial color="#25354d" /></mesh>
      <mesh position={[-0.3, -0.06, 0.5]}><sphereGeometry args={[0.06, 16, 16]} /><meshStandardMaterial color="#ffb3c1" transparent opacity={0.7} /></mesh>
      <mesh position={[0.3, -0.06, 0.5]}><sphereGeometry args={[0.06, 16, 16]} /><meshStandardMaterial color="#ffb3c1" transparent opacity={0.7} /></mesh>
      {/* 구름 테두리 */}
      <group ref={puffs} position={[0, BIN.h / 2, 0]}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * BIN.rTop, 0.02 + (i % 2) * 0.03, Math.sin(a) * BIN.rTop]}>
              <sphereGeometry args={[0.13 + (i % 3) * 0.02, 20, 16]} />
              <meshStandardMaterial color={puff} roughness={1} />
            </mesh>
          );
        })}
      </group>
      {/* 구름 뚜껑: 뒤쪽 경첩, 분석 중에는 닫힌다 */}
      <group position={[0, BIN.h / 2 + 0.05, -BIN.rTop]}>
        <group ref={lid} rotation={[-0.9, 0, 0]} scale={0.001}>
          {[[0, 0.06, BIN.rTop, 0.42], [-0.32, 0.03, BIN.rTop, 0.3], [0.32, 0.03, BIN.rTop, 0.3], [0, 0.12, BIN.rTop - 0.25, 0.3]].map(([x, y, z, rr], i) => (
            <mesh key={i} position={[x, y, z]} scale={[1, 0.55, 1]}>
              <sphereGeometry args={[rr, 24, 18]} />
              <meshStandardMaterial color={puff} roughness={1} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/* ══ 스테이지 ═════════════════════════════════════════════════════════ */
export type BinStageHandle = { crumple: () => void; unfold: () => void; autoThrow: () => void; respawn: () => void };

function Scene(props: {
  kind: TrashKind; texture: THREE.Texture; phase: Phase; canCrumple: boolean;
  cmd: React.RefObject<Commands>; cb: Callbacks;
}) {
  const layout = useLayout();
  const shared = useRef<Shared>({ near: 0, wobble: 0, hop: 0 });
  const showObject = !["dropped", "analyzing", "ready", "opened"].includes(props.phase);
  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[3, 5, 6]} intensity={1.3} />
      <directionalLight position={[-4, 1, 3]} intensity={0.35} color="#dcd5ff" />
      {showObject && <Throwable key={props.kind} {...props} layout={layout} shared={shared} />}
      <CloudBin layout={layout} phase={props.phase} shared={shared} cb={props.cb} />
    </>
  );
}

const BinStage = forwardRef<BinStageHandle, {
  kind: TrashKind; texture: THREE.Texture; phase: Phase; canCrumple: boolean; className?: string;
} & Callbacks>(function BinStage({ kind, texture, phase, canCrumple, className, ...cb }, ref) {
  const cmd = useRef<Commands>({ crumple: false, unfold: false, auto: false, respawn: false });
  useImperativeHandle(ref, () => ({
    crumple: () => (cmd.current.crumple = true),
    unfold: () => (cmd.current.unfold = true),
    autoThrow: () => (cmd.current.auto = true),
    respawn: () => (cmd.current.respawn = true),
  }));
  return (
    <div className={className} style={{ touchAction: "none" }}>
      <Canvas flat camera={{ position: [0, 0, 6], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <Scene kind={kind} texture={texture} phase={phase} canCrumple={canCrumple} cmd={cmd} cb={cb} />
      </Canvas>
    </div>
  );
});

export default BinStage;
