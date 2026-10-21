"use client";

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Phase } from "@/lib/loop";
import { usePrefs } from "@/lib/prefs";

/* ── 노이즈 ─────────────────────────────────────────────────────────── */
const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

/* ── 종이 · 레이아웃 상수 ──────────────────────────────────────────── */
const W = 1.5, H = 1.95, SX = 40, SY = 52;
const BALL_R = 0.42;
const BIN = { rTop: 0.56, rBottom: 0.44, h: 0.95 };
const DROP_RADIUS = 0.72;

type Layout = {
  paper: THREE.Vector3; scale: number; bin: THREE.Vector3; mouth: THREE.Vector3; cloud: THREE.Vector3; cloudScale: number;
};

function useLayout(): Layout {
  const { viewport } = useThree();
  return useMemo(() => {
    const portrait = viewport.width < viewport.height;
    if (portrait) {
      const bin = new THREE.Vector3(0, -viewport.height / 2 + 0.75, 0);
      return {
        paper: new THREE.Vector3(0, 0.55, 0), scale: Math.min(1.1, (viewport.width - 0.4) / W), bin,
        mouth: bin.clone().setY(bin.y + BIN.h / 2), cloud: new THREE.Vector3(0, 0.75, 0),
        cloudScale: Math.min(0.8, (viewport.width - 0.3) / 2.8),
      };
    }
    const bin = new THREE.Vector3(Math.min(viewport.width * 0.26, 2.2), -0.95, 0);
    return {
      paper: new THREE.Vector3(-Math.min(viewport.width * 0.17, 1.4), 0.1, 0), scale: 1.2, bin,
      mouth: bin.clone().setY(bin.y + BIN.h / 2),
      // 구름이 캔버스 밖으로 나가지 않게 가운데 쪽으로 당긴다
      cloud: new THREE.Vector3(Math.min(bin.x, viewport.width / 2 - 1.3), 0.95, 0), cloudScale: 0.8,
    };
  }, [viewport.width, viewport.height]);
}

/* ── 명령 (버튼 → 3D) ──────────────────────────────────────────────── */
type Commands = { auto: boolean; unfold: boolean; toss: boolean; open: boolean };
type Shared = { binHot: boolean; wobble: number };

export type StageHandle = { autoCrumple: () => void; unfold: () => void; toss: () => void; openCloud: () => void };

type Callbacks = {
  onProgress: (p: number) => void;
  onBall: () => void;
  onDropped: () => void;
  onOpened: () => void;
  onBlocked: () => void;
};

/* ── 종이 메시: 정점 단위 구김 ─────────────────────────────────────── */
function PaperMesh({ texture, layout, phase, canCrumple, cmd, shared, cb }: {
  texture: THREE.Texture; layout: Layout; phase: Phase; canCrumple: boolean;
  cmd: React.RefObject<Commands>; shared: React.RefObject<Shared>; cb: Callbacks;
}) {
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(W, H, SX, SY), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);

  // 정점별 기준 위치(평면) · 목표 위치(종이공) · 주름 시드 · 구김도
  const d = useMemo(() => {
    const pos = geo.attributes.position, uv = geo.attributes.uv, n = pos.count;
    const base = new Float32Array(n * 3), ball = new Float32Array(n * 3);
    const wr = new Float32Array(n), c = new Float32Array(n), us = new Float32Array(n), vs = new Float32Array(n);
    const eps = 1e-4;
    for (let i = 0; i < n; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      us[i] = u; vs[i] = v;
      let x = pos.getX(i), y = pos.getY(i);
      // 가장자리를 살짝 구불하게 (손으로 찢은 종이 느낌)
      const nx = u < eps ? -1 : u > 1 - eps ? 1 : 0, ny = v < eps ? -1 : v > 1 - eps ? 1 : 0;
      const wob = (noise(u * 11 + v * 7, 3.3) - 0.5) * 0.05;
      x += nx * wob; y += ny * wob;
      base.set([x, y, 0], i * 3);
      const theta = u * Math.PI * 2 + (noise(u * 3, v * 3) - 0.5) * 0.9;
      const phi = 0.08 + v * (Math.PI - 0.16) + (noise(v * 4 + 9, u * 4) - 0.5) * 0.5;
      const r = BALL_R * (0.8 + 0.35 * noise(u * 6 + 1.7, v * 6 + 3.1)) * (0.92 + 0.16 * hash(i, 7));
      ball.set([r * Math.sin(phi) * Math.cos(theta), -r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)], i * 3);
      wr[i] = noise(u * 10, v * 10) - 0.5;
    }
    return { base, ball, wr, c, us, vs, n };
  }, [geo]);

  const st = useRef({
    anim: "none" as "none" | "auto" | "unfold",
    mode: "paper" as "paper" | "ball" | "drag" | "return" | "drop" | "gone",
    dragging: false, dirty: true, last: new THREE.Vector3(), lastUv: new THREE.Vector2(0.5, 0.5),
    target: new THREE.Vector3(), vel: new THREE.Vector3(), dropT: 0, reported: -1, dropFrom: new THREE.Vector3(),
  });

  // 흐름이 처음으로 돌아가면(아니요·다른 물건) 종이를 다시 편다.
  useEffect(() => {
    const s = st.current;
    if (phase === "write" && s.mode !== "paper") {
      s.mode = "paper";
      s.anim = "unfold";
      if (group.current) {
        group.current.visible = true;
        group.current.scale.setScalar(layout.scale);
        group.current.position.copy(layout.paper);
      }
    }
  }, [phase, layout]);

  useFrame((_, dt) => {
    const g = group.current, s = st.current, c = d.c, k = cmd.current, sh = shared.current;
    if (!g || !k || !sh) return;
    dt = Math.min(dt, 1 / 30);

    // 버튼 명령
    if (k.auto) {
      k.auto = false;
      if (s.mode === "paper") {
        if (canCrumple) s.anim = "auto";
        else cb.onBlocked();
      }
    }
    if (k.unfold) {
      k.unfold = false;
      if (s.mode === "paper" || s.mode === "ball") { s.mode = "paper"; s.anim = "unfold"; }
    }
    if (k.toss) {
      k.toss = false;
      if (s.mode === "ball") { s.mode = "drop"; s.dropT = 0; s.dropFrom.copy(g.position); }
    }

    // 구김 애니메이션
    if (s.anim === "auto") {
      let done = true;
      for (let i = 0; i < d.n; i++) {
        c[i] = Math.min(1, c[i] + dt * (1.1 + d.wr[i]));
        if (c[i] < 1) done = false;
      }
      s.dirty = true;
      if (done) s.anim = "none";
    } else if (s.anim === "unfold") {
      let done = true;
      for (let i = 0; i < d.n; i++) {
        c[i] = Math.max(0, c[i] - dt * 1.8);
        if (c[i] > 0) done = false;
      }
      s.dirty = true;
      if (done) s.anim = "none";
    }

    if (s.dirty) {
      let sum = 0, min = 1;
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < d.n; i++) {
        const ci = c[i], e = smooth(ci), j = i * 3;
        sum += ci;
        if (ci < min) min = ci;
        const wrinkle = Math.sin(Math.PI * ci) * d.wr[i] * 0.32;
        p.setXYZ(
          i,
          d.base[j] + (d.ball[j] - d.base[j]) * e + wrinkle * 0.25,
          d.base[j + 1] + (d.ball[j + 1] - d.base[j + 1]) * e - wrinkle * 0.2,
          d.ball[j + 2] * e + wrinkle,
        );
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      s.dirty = false;
      const mean = sum / d.n;
      if (Math.abs(mean - s.reported) > 0.02) { s.reported = mean; cb.onProgress(mean); }
      if (s.mode === "paper" && s.anim !== "unfold" && mean > 0.8 && min < 1) s.anim = "auto";
      if (s.mode === "paper" && min >= 1) { s.mode = "ball"; cb.onBall(); }
    }

    // 위치·회전
    const home = layout.paper;
    if (s.mode === "paper") {
      g.position.lerp(home, 1 - Math.exp(-6 * dt));
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0, 4, dt);
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, 0, 3, dt);
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -0.05, 4, dt);
    } else if (s.mode === "ball" || s.mode === "return") {
      g.position.lerp(home, 1 - Math.exp(-7 * dt));
      g.rotation.y += dt * 0.4;
      if (s.mode === "return" && g.position.distanceTo(home) < 0.02) s.mode = "ball";
    } else if (s.mode === "drag") {
      const prev = g.position.clone();
      g.position.lerp(s.target, 1 - Math.exp(-18 * dt));
      s.vel.subVectors(g.position, prev).divideScalar(Math.max(dt, 1e-3));
      g.rotation.x -= s.vel.y * dt * 1.6; // 굴러가듯 회전
      g.rotation.y += s.vel.x * dt * 1.6;
    } else if (s.mode === "drop") {
      s.dropT += dt;
      const above = layout.mouth.clone().setY(layout.mouth.y + 0.55);
      if (s.dropT < 0.28) {
        const t = smooth(s.dropT / 0.28);
        g.position.lerpVectors(s.dropFrom, above, t).setY(THREE.MathUtils.lerp(s.dropFrom.y, above.y, t) + Math.sin(Math.PI * t) * 0.35);
      } else {
        const t = Math.min(1, (s.dropT - 0.28) / 0.32);
        g.position.lerpVectors(above, layout.mouth.clone().setY(layout.mouth.y - 0.3), t * t);
        g.scale.setScalar(layout.scale * (1 - 0.35 * t));
        if (t >= 1) {
          s.mode = "gone";
          g.visible = false;
          sh.wobble = 1;
          cb.onDropped();
        }
      }
      g.rotation.x += dt * 5;
    }
    sh.binHot = s.mode === "drag" && Math.hypot(g.position.x - layout.mouth.x, g.position.y - (layout.mouth.y + 0.3)) < DROP_RADIUS;
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    e.stopPropagation();
    if (s.mode === "paper") {
      if (!canCrumple) return cb.onBlocked();
      s.dragging = true;
      s.anim = "none";
      s.last.copy(e.point);
      if (e.uv) s.lastUv.copy(e.uv);
    } else if (s.mode === "ball" || s.mode === "return") {
      s.mode = "drag";
      s.dragging = true;
      e.ray.intersectPlane(plane, s.target);
    } else return;
    (e.target as unknown as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    if (!s.dragging) return;
    if (s.mode === "paper") {
      // 포인터가 지나간 자리 주변의 정점을 더 많이 구긴다
      const dist = e.point.distanceTo(s.last);
      s.last.copy(e.point);
      if (e.uv) s.lastUv.copy(e.uv);
      const hu = s.lastUv.x, hv = s.lastUv.y;
      for (let i = 0; i < d.n; i++) {
        const du = d.us[i] - hu, dv = d.vs[i] - hv;
        const w = Math.exp(-(du * du + dv * dv) / 0.05);
        d.c[i] = Math.min(1, d.c[i] + dist * (0.9 * w + 0.1));
      }
      st.current.dirty = true;
      if (group.current) group.current.rotation.y += (e.point.x - group.current.position.x) * dist * 0.4;
    } else if (s.mode === "drag") {
      e.ray.intersectPlane(plane, s.target);
    }
  };

  const up = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
    if (s.mode === "drag") {
      if (shared.current?.binHot) {
        s.mode = "drop";
        s.dropT = 0;
        s.dropFrom.copy(group.current!.position);
      } else s.mode = "return"; // 통 밖에 놓으면 제자리로
    }
  };

  const dark = usePrefs((s) => s.theme === "dark");
  return (
    <group ref={group} position={layout.paper} scale={layout.scale}>
      <mesh
        geometry={geo}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerOver={() => (document.body.style.cursor = "grab")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.95} metalness={0} flatShading color={dark ? "#d9d6cc" : "#ffffff"} />
      </mesh>
    </group>
  );
}

/* ── 쓰레기통 ──────────────────────────────────────────────────────── */
function Bin({ layout, visible, shared }: { layout: Layout; visible: boolean; shared: React.RefObject<Shared> }) {
  const g = useRef<THREE.Group>(null);
  const rim = useRef<THREE.MeshStandardMaterial>(null);
  const dark = usePrefs((s) => s.theme === "dark");
  const base = dark ? "#55675f" : "#a9bdb3";
  useFrame((state, dt) => {
    const grp = g.current, sh = shared.current;
    if (!grp || !sh) return;
    const s = THREE.MathUtils.damp(grp.scale.x, visible ? 1 : 0.001, 8, dt);
    grp.scale.setScalar(s);
    grp.visible = s > 0.01;
    grp.rotation.z = Math.sin(state.clock.elapsedTime * 24) * 0.08 * sh.wobble;
    sh.wobble = Math.max(0, sh.wobble - dt * 1.6);
    rim.current?.color.lerp(new THREE.Color(sh.binHot ? (dark ? "#8db5a6" : "#2f5d50") : dark ? "#6f8379" : "#7f978b"), 1 - Math.exp(-10 * dt));
  });
  return (
    <group ref={g} position={layout.bin} scale={0.001}>
      <mesh>
        <cylinderGeometry args={[BIN.rTop, BIN.rBottom, BIN.h, 48, 1, true]} />
        <meshStandardMaterial color={base} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -BIN.h / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[BIN.rBottom, 40]} />
        <meshStandardMaterial color={dark ? "#2a332f" : "#7c8f86"} roughness={1} />
      </mesh>
      <mesh position={[0, BIN.h / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[BIN.rTop, 0.035, 12, 64]} />
        <meshStandardMaterial ref={rim} color="#7f978b" roughness={1} />
      </mesh>
    </group>
  );
}

/* ── 결과 구름: 입자가 모여 구름이 되고, 누르면 양옆으로 열린다 ─────── */
const PUFFS: [number, number, number, number][] = [
  [0, 0, 0, 0.62], [-0.62, -0.12, 0, 0.46], [0.62, -0.1, 0, 0.48], [-0.28, 0.36, -0.05, 0.44],
  [0.32, 0.32, -0.05, 0.46], [-0.95, -0.22, -0.05, 0.3], [0.98, -0.2, -0.05, 0.32],
];
const N_PARTICLES = 40;

function ResultCloud({ layout, phase, cmd, cb }: {
  layout: Layout; phase: Phase; cmd: React.RefObject<Commands>; cb: Callbacks;
}) {
  const dark = usePrefs((s) => s.theme === "dark");
  const inst = useRef<THREE.InstancedMesh>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true }), []);
  mat.color.set(dark ? "#dfe5e8" : "#ffffff");
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () => Array.from({ length: N_PARTICLES }, (_, i) => {
      const p = PUFFS[i % PUFFS.length];
      const a = hash(i, 1) * Math.PI * 2, b = hash(i, 2) * Math.PI;
      return {
        delay: hash(i, 3) * 1.2, orbit: 0.5 + hash(i, 4) * 0.7, speed: 0.6 + hash(i, 5),
        target: new THREE.Vector3(p[0] + Math.sin(b) * Math.cos(a) * p[3] * 0.9, p[1] + Math.cos(b) * p[3] * 0.9, p[2] + Math.sin(b) * Math.sin(a) * p[3] * 0.5),
        pos: new THREE.Vector3(),
      };
    }),
    [],
  );
  const st = useRef({ t: 0, form: 0, open: 0, opened: false });

  useEffect(() => {
    if (phase === "analyzing") Object.assign(st.current, { t: 0, form: 0, open: 0, opened: false });
  }, [phase]);

  useFrame((state, dt) => {
    const s = st.current, im = inst.current, k = cmd.current;
    if (!im || !left.current || !right.current || !k) return;
    const active = phase === "analyzing" || phase === "ready" || phase === "opened" || phase === "error";
    im.visible = active && s.form < 1 && phase !== "opened";
    left.current.visible = right.current.visible = active && s.form > 0 && s.open < 1;
    if (!active) return;
    s.t += dt;
    if (phase === "ready" || phase === "opened") s.form = Math.min(1, s.form + dt * 1.4);
    if ((k.open && phase === "ready") || (phase === "opened" && s.open === 0)) { k.open = false; s.open = 0.0001; }
    if (s.open > 0 && s.open < 1) {
      s.open = Math.min(1, s.open + dt * 1.5);
      if (s.open >= 1 && !s.opened) { s.opened = true; cb.onOpened(); }
    }

    const c = layout.cloud, m = layout.mouth;
    seeds.forEach((sd, i) => {
      const life = Math.max(0, s.t - sd.delay);
      const rise = Math.min(1, life * 0.8);
      // 쓰레기통에서 올라와 구름 자리 주변을 맴돈다
      const ang = s.t * sd.speed + i;
      const swirl = new THREE.Vector3(Math.cos(ang) * sd.orbit, Math.sin(ang * 1.3) * sd.orbit * 0.4, Math.sin(ang) * 0.3);
      const hover = c.clone().add(swirl);
      sd.pos.lerpVectors(m, hover, smooth(rise));
      if (phase === "error") sd.pos.y -= life * 0.3;
      const formed = c.clone().addScaledVector(sd.target, layout.cloudScale);
      sd.pos.lerp(formed, smooth(s.form));
      dummy.position.copy(sd.pos);
      dummy.scale.setScalar((life > 0 ? 1 : 0) * (1 - s.form * 0.7));
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;

    const f = smooth(s.form) * layout.cloudScale, o = smooth(s.open);
    const bob = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
    left.current.position.set(c.x - o * 1.2, c.y + bob, c.z);
    right.current.position.set(c.x + o * 1.2, c.y + bob, c.z);
    left.current.rotation.z = o * 0.35;
    right.current.rotation.z = -o * 0.35;
    left.current.scale.setScalar(f * (1 - o * 0.4));
    right.current.scale.setScalar(f * (1 - o * 0.4));
    mat.opacity = 1 - o;
  });

  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (phase === "ready" && cmd.current) cmd.current.open = true;
  };
  const half = (side: -1 | 1) =>
    PUFFS.filter(([x]) => (side < 0 ? x <= 0 : x > 0)).map(([x, y, z, r], i) => (
      <mesh key={i} position={[x, y, z]} material={mat}>
        <sphereGeometry args={[r, 36, 28]} />
      </mesh>
    ));

  return (
    <group
      onClick={open}
      onPointerOver={() => phase === "ready" && (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <instancedMesh ref={inst} args={[undefined, undefined, N_PARTICLES]} material={mat}>
        <sphereGeometry args={[0.07, 12, 12]} />
      </instancedMesh>
      <group ref={left}>{half(-1)}</group>
      <group ref={right}>{half(1)}</group>
    </group>
  );
}

/* ── 스테이지 ──────────────────────────────────────────────────────── */
function Scene(props: {
  texture: THREE.Texture; phase: Phase; canCrumple: boolean; cmd: React.RefObject<Commands>; cb: Callbacks;
}) {
  const layout = useLayout();
  const shared = useRef<Shared>({ binHot: false, wobble: 0 });
  const binVisible = ["ball", "dropped", "analyzing", "ready", "opened", "error"].includes(props.phase);
  return (
    <>
      <ambientLight intensity={1.05} />
      <directionalLight position={[3, 4, 5]} intensity={1.35} />
      <directionalLight position={[-4, -2, 3]} intensity={0.3} />
      <PaperMesh {...props} layout={layout} shared={shared} />
      <Bin layout={layout} visible={binVisible} shared={shared} />
      <ResultCloud layout={layout} phase={props.phase} cmd={props.cmd} cb={props.cb} />
    </>
  );
}

const CrumpleStage = forwardRef<StageHandle, {
  texture: THREE.Texture; phase: Phase; canCrumple: boolean; className?: string;
} & Callbacks>(function CrumpleStage({ texture, phase, canCrumple, className, ...cb }, ref) {
  const cmd = useRef<Commands>({ auto: false, unfold: false, toss: false, open: false });
  useImperativeHandle(ref, () => ({
    autoCrumple: () => (cmd.current.auto = true),
    unfold: () => (cmd.current.unfold = true),
    toss: () => (cmd.current.toss = true),
    openCloud: () => (cmd.current.open = true),
  }));
  return (
    <div className={className} style={{ touchAction: "none" }}>
      <Canvas flat camera={{ position: [0, 0, 6], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <Scene texture={texture} phase={phase} canCrumple={canCrumple} cmd={cmd} cb={cb} />
      </Canvas>
    </div>
  );
});

export default CrumpleStage;
