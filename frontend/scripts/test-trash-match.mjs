import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// 규칙 엔진(engine.ts)만 컴파일해서 테스트한다 — 셸 종류와 무관하게 동작하도록 이 파일이 직접 컴파일한다.
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
execFileSync(process.execPath, [tsc, "src/features/trash-match/engine.ts", "--outDir", ".tmp-puzzle", "--module", "esnext", "--target", "es2020", "--strict", "--skipLibCheck"], { stdio: "inherit" });
mkdirSync(".tmp-puzzle", { recursive: true });
writeFileSync(".tmp-puzzle/package.json", '{"type":"module"}');
const E = await import("../.tmp-puzzle/engine.js");
const lcg = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const mk = (seed = 1) => ({ rng: lcg(seed), nextId: 1 });
const base = (ctx) => Array.from({ length: E.ROWS }, (_, r) => Array.from({ length: E.COLS }, (_, c) => ({ id: ctx.nextId++, kind: (r * 2 + c) % 6, special: null })));
const set = (b, cells, kind) => cells.forEach(([r, c]) => (b[r][c] = { ...b[r][c], kind }));
const ok = (name, fn) => { fn(); console.log("ok -", name); };

ok("초기 보드: 터진 곳 없음 + 움직일 곳 있음 (200개)", () => {
  for (let s = 1; s <= 200; s++) { const b = E.createBoard(mk(s)); assert.equal(E.findRuns(b).length, 0); assert.ok(E.hasMove(b)); }
});

ok("잘못된 교환은 null", () => {
  const c = mk(); const b = base(c);
  assert.equal(E.findRuns(b).length, 0);
  assert.equal(E.resolveMove(c, b, [0, 0], [0, 1]), null);
});

ok("4개 가로 → 줄 폭탄(line-h), 방금 바꾼 칸에 생성, 점수 40+50", () => {
  const c = mk(); const b = base(c);
  set(b, [[3, 0], [3, 1], [3, 3], [4, 2]], 5);
  b[3][2] = { ...b[3][2], kind: 0 }; b[2][2] = { ...b[2][2], kind: 1 };
  assert.equal(E.findRuns(b).length, 0, "사전조건");
  const res = E.resolveMove(c, b, [3, 2], [4, 2]);
  assert.ok(res);
  const s0 = res.steps[0];
  assert.equal(s0.created.length, 1); assert.equal(s0.created[0].special, "line-h");
  assert.deepEqual([s0.created[0].r, s0.created[0].c], [3, 2]);
  assert.equal(s0.cleared.length, 3);
  assert.equal(s0.points, 3 * 10 * 1 + 50);
});

ok("L자 → 구역 폭탄(bomb), 교차 칸에 생성", () => {
  const c = mk(); const b = base(c);
  set(b, [[3, 1], [3, 2], [4, 3], [5, 3], [2, 3]], 5);
  b[3][3] = { ...b[3][3], kind: 0 };
  assert.equal(E.findRuns(b).length, 0, "사전조건");
  const res = E.resolveMove(c, b, [2, 3], [3, 3]);
  assert.ok(res);
  const m = res.steps[0].created[0];
  assert.equal(m.special, "bomb"); assert.deepEqual([m.r, m.c], [3, 3]);
});

ok("5개 한 줄 → 분리수거 폭탄(color)", () => {
  const c = mk(); const b = base(c);
  set(b, [[3, 0], [3, 1], [3, 3], [3, 4], [2, 2]], 5);
  b[3][5] = { ...b[3][5], kind: 1 };
  b[3][2] = { ...b[3][2], kind: 0 };
  assert.equal(E.findRuns(b).length, 0, "사전조건");
  const res = E.resolveMove(c, b, [2, 2], [3, 2]);
  assert.equal(res.steps[0].created[0].special, "color");
});

ok("분리수거 폭탄: 바꾼 종류가 전부 사라진다", () => {
  const c = mk(); const b = base(c);
  b[0][0] = { id: 9999, kind: -1, special: "color" };
  const target = b[0][1].kind;
  const count = b.flat().filter((t) => t.kind === target).length;
  const res = E.resolveMove(c, b, [0, 0], [0, 1]);
  assert.ok(res);
  assert.ok(res.steps[0].cleared.length >= count + 1, `${res.steps[0].cleared.length} >= ${count + 1}`);
});

ok("줄 폭탄: 바꾸면 그 줄이 전부 사라진다", () => {
  const c = mk(); const b = base(c);
  b[4][4] = { ...b[4][4], special: "line-h" };
  const res = E.resolveMove(c, b, [4, 4], [4, 5]);
  assert.ok(res);
  const row4 = res.steps[0].cleared.filter(([r]) => r === 4).length;
  assert.equal(row4, E.COLS);
});

ok("구역 폭탄: 5×5(가장자리 아닐 때 25칸)", () => {
  const c = mk(); const b = base(c);
  b[4][4] = { ...b[4][4], special: "bomb" };
  const res = E.resolveMove(c, b, [4, 4], [4, 5]);
  assert.ok(res.steps[0].cleared.length >= 25);
});

ok("콤보 배수 ×1,×2,×3,×4(최대) · 시간 보너스 · 보드 유지", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(E.multiplierFor), [1, 2, 3, 4, 4, 4]);
  let maxChain = 0, total = 0;
  for (let s = 1; s <= 300; s++) {
    const c = mk(s); const b = E.createBoard(c);
    for (let r = 0; r < E.ROWS; r++) for (let q = 0; q < E.COLS; q++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
      if (r + dr >= E.ROWS || q + dc >= E.COLS) continue;
      const res = E.resolveMove(mk(s * 7), b, [r, q], [r + dr, q + dc]);
      if (!res) continue;
      total++;
      res.steps.forEach((st, i) => {
        if (st.shuffle) return;
        assert.equal(st.multiplier, E.multiplierFor(st.chain)); assert.equal(st.chain, i + 1);
        assert.ok(st.points >= st.cleared.length * 10 * st.multiplier);
        assert.ok(st.bonusTime > 0);
        maxChain = Math.max(maxChain, st.chain);
        assert.ok(st.after.flat().every((t) => t && t.id > 0), "빈칸 없음");
      });
      assert.equal(E.findRuns(res.final).length, 0, "끝난 보드에 터질 곳 없음");
      assert.ok(E.hasMove(res.final), "끝난 보드에 움직일 곳 있음");
    }
  }
  console.log("   시뮬레이션 이동", total, "회, 최대 연쇄", maxChain);
  assert.ok(maxChain >= 3);
});
console.log("ALL PASSED");
