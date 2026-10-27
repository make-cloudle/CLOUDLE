// 스테이지 밸런스 시뮬레이션: node scripts/sim-trail.mjs [판 수=150] [수당 생각 시간(초)=2.5]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
execFileSync(process.execPath, [tsc, "src/features/trash-match/engine.ts", "src/features/trash-match/stages.ts", "--outDir", ".tmp-puzzle", "--module", "esnext", "--target", "es2020", "--strict", "--skipLibCheck"], { stdio: "inherit" });
mkdirSync(".tmp-puzzle", { recursive: true });
writeFileSync(".tmp-puzzle/package.json", '{"type":"module"}');
const E = await import("../.tmp-puzzle/engine.js");
const S = await import("../.tmp-puzzle/stages.js");
const RUNS = Number(process.argv[2] ?? 150), THINK = Number(process.argv[3] ?? 2.5);
const lcg = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

function moves() { const out = []; for (let r = 0; r < E.ROWS; r++) for (let c = 0; c < E.COLS; c++) { if (c + 1 < E.COLS) out.push([[r, c], [r, c + 1]]); if (r + 1 < E.ROWS) out.push([[r, c], [r + 1, c]]); } return out; }
function valid(board, ctx) { return moves().map(([a, b]) => ({ a, b, res: E.resolveMove({ ...ctx, rng: lcg(7) }, board, a, b) })).filter((m) => m.res); }
const gainOf = (res) => res.steps.reduce((n, s) => n + s.points, 0);

/** kind: random(캐주얼, 15%는 헛손질) | greedy(그 순간 점수가 가장 큰 수) */
function play(stage, seed, kind) {
  const ctx = { rng: lcg(seed), nextId: 1, kinds: stage.kinds, dirtRate: stage.dirtRate, dirtMax: stage.dirtMax };
  const pick = lcg(seed * 31 + 5);
  let board = E.createBoard(ctx), time = stage.time, p = S.emptyProgress(), moves_ = 0;
  while (time > 0) {
    time -= THINK; moves_++;
    if (time <= 0) break;
    const miss = (kind === "random" && pick() < 0.15) || (kind === "mid" && pick() < 0.05);
    const cands = miss ? [] : valid(board, ctx);
    if (!cands.length) { const pen = S.penaltyFor(stage, false, 0); p.score = Math.max(0, p.score - pen.points); time -= pen.seconds; continue; }
    // mid: 눈에 띄는 후보 3개 중 가장 큰 수를 고르는 보통 플레이어
    const sample = kind === "mid" ? Array.from({ length: 3 }, () => cands[Math.floor(pick() * cands.length)]) : cands;
    const m = kind === "random" ? cands[Math.floor(pick() * cands.length)] : sample.reduce((x, y) => (gainOf(y.res) > gainOf(x.res) ? y : x));
    const res = E.resolveMove(ctx, board, m.a, m.b);
    for (const s of res.steps) {
      p.score += s.points; time = Math.min(stage.maxTime, time + s.bonusTime);
      p.washes += s.washed.length;
      if (stage.goal.collect) p.collected += s.kindsCleared[stage.goal.collect.kind];
    }
    board = res.final;
    const pen = S.penaltyFor(stage, true, res.dirtLeft);
    p.score = Math.max(0, p.score - pen.points);
    if (S.isCleared(stage, p)) return { ok: true, stars: S.starsFor(stage, S.finalScore(stage, p.score, time)), moves: moves_ };
  }
  return { ok: false, stars: 0, moves: moves_, score: p.score };
}

console.log(`판 수 ${RUNS} · 수당 ${THINK}s · 클리어율(평균 별)`);
console.log("레벨   스테이지  캐주얼(랜덤)      보통(3중 택1)     욕심쟁이(그리디)");
for (const level of S.LEVELS) {
  for (let no = 1; no <= S.STAGES_PER_LEVEL; no++) {
    const st = S.getStage(level, no);
    const row = ["random", "mid", "greedy"].map((kind) => {
      let ok = 0, stars = 0;
      for (let i = 0; i < RUNS; i++) { const r = play(st, 1000 + i * 7 + no, kind); if (r.ok) { ok++; stars += r.stars; } }
      return `${String(Math.round((ok / RUNS) * 100)).padStart(3)}% ★${(ok ? stars / ok : 0).toFixed(1)}`;
    });
    console.log(`${level.padEnd(6)} ${String(no).padStart(2)}       ${row[0].padEnd(16)} ${row[1].padEnd(16)} ${row[2]}`);
  }
}
