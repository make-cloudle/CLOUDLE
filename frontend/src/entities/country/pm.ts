/** Earth SOS: PM2.5 연평균 단계별 색 (WHO 권고 5, 잠정목표 10·15·25·35 µg/m³ 기준) */
export const PM_STEPS = [
  { max: 10, color: "#bce8c8" }, { max: 15, color: "#dcefb8" }, { max: 25, color: "#ffe5a3" },
  { max: 35, color: "#ffc39e" }, { max: Infinity, color: "#f0907a" },
];
export const pmColor = (v: number) => PM_STEPS.find((s) => v < s.max)!.color;

