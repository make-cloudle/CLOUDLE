"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { CloudMood } from "@/lib/loop";
import { usePrefs } from "@/lib/prefs";

/** 둥근 구름 실루엣을 이루는 퍼프: [x, y, z, r] */
const PUFFS: [number, number, number, number][] = [
  [0, 0, 0, 0.6],
  [-0.56, -0.12, 0.02, 0.44],
  [0.56, -0.1, 0.02, 0.46],
  [-0.26, 0.34, -0.05, 0.42],
  [0.3, 0.3, -0.05, 0.44],
  [0, -0.28, 0.16, 0.42],
];

const damp = (a: number, b: number, k: number, dt: number) => THREE.MathUtils.damp(a, b, k, dt);

function CloudBody({ mood }: { mood: CloudMood }) {
  const dark = usePrefs((s) => s.theme === "dark");
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const smile = useRef<THREE.Mesh>(null);
  const oMouth = useRef<THREE.Mesh>(null);
  const orbit = useRef<THREE.Group>(null);
  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, color: "#ffffff" }),
    [],
  );
  const inkMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1, color: "#2b2b28" }), []);
  bodyMat.color.set(dark ? "#dfe5e8" : "#ffffff");

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const g = root.current, b = body.current;
    if (!g || !b) return;
    // 공통: 둥실둥실
    let targetY = Math.sin(t * 1.2) * 0.06;
    let targetRotY = 0, targetRotZ = Math.sin(t * 0.6) * 0.04, targetScale = 1;

    if (mood === "country") targetRotY = -0.45;
    if (mood === "thinking") targetScale = 1 + Math.sin(t * 4) * 0.04;
    if (mood === "retrieving") targetRotY = Math.sin(t * 2.4) * 0.45;
    if (mood === "generating") targetScale = 1.05 + Math.sin(t * 2) * 0.02;
    if (mood === "complete") targetY = Math.abs(Math.sin(t * 3)) * 0.14;
    if (mood === "error") targetRotZ = 0.22;

    g.position.y = damp(g.position.y, targetY, 6, dt);
    g.rotation.y = damp(g.rotation.y, targetRotY, 4, dt);
    g.rotation.z = damp(g.rotation.z, targetRotZ, 4, dt);
    const s = damp(b.scale.x, targetScale, 6, dt);
    b.scale.set(s, s * (mood === "thinking" ? 1.02 : 1), s);

    // 생성 중에는 하늘색으로 아주 살짝 물든다 (발광 효과 없음)
    const tint = mood === "generating" ? (dark ? "#cfdce5" : "#eef4f8") : dark ? "#dfe5e8" : "#ffffff";
    bodyMat.color.lerp(new THREE.Color(tint), 1 - Math.exp(-3 * dt));

    if (smile.current && oMouth.current) {
      const happy = mood === "complete" || mood === "idle" || mood === "country";
      smile.current.visible = happy || mood === "error";
      smile.current.rotation.z = mood === "error" ? 0 : Math.PI; // 위로 열린 호 = 미소
      smile.current.position.y = mood === "error" ? -0.2 : -0.12;
      oMouth.current.visible = !smile.current.visible;
    }
    if (orbit.current) {
      orbit.current.visible = mood === "thinking" || mood === "retrieving";
      orbit.current.rotation.z = t * 1.6;
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {PUFFS.map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} material={bodyMat}>
            <sphereGeometry args={[r, 40, 32]} />
          </mesh>
        ))}
        {/* 얼굴 */}
        <mesh position={[-0.17, 0.06, 0.6]} material={inkMat}>
          <sphereGeometry args={[0.045, 16, 16]} />
        </mesh>
        <mesh position={[0.17, 0.06, 0.6]} material={inkMat}>
          <sphereGeometry args={[0.045, 16, 16]} />
        </mesh>
        <mesh ref={smile} position={[0, -0.12, 0.6]} material={inkMat}>
          <torusGeometry args={[0.09, 0.016, 8, 24, Math.PI]} />
        </mesh>
        <mesh ref={oMouth} position={[0, -0.1, 0.6]} material={inkMat}>
          <torusGeometry args={[0.035, 0.014, 8, 20]} />
        </mesh>
      </group>
      {/* 생각 중: 작은 구름 입자 */}
      <group ref={orbit} position={[0, 0.2, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i * Math.PI * 2) / 3) * 0.95, Math.sin((i * Math.PI * 2) / 3) * 0.95, 0.1]} material={bodyMat}>
            <sphereGeometry args={[0.08 + i * 0.02, 16, 16]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export default function CloudCharacter({ mood, className, label }: {
  mood: CloudMood; className?: string; label?: string;
}) {
  return (
    <div className={className} role="img" aria-label={label ?? `cloud: ${mood}`}>
      <Canvas flat camera={{ position: [0, 0, 3.4], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 3, 4]} intensity={1.4} />
        <directionalLight position={[-3, -1, 2]} intensity={0.35} />
        <CloudBody mood={mood} />
      </Canvas>
    </div>
  );
}
