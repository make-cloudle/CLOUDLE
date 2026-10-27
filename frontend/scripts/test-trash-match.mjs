import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// 규칙 엔진(engine.ts)만 컴파일해서 테스트한다 — 셸 종류와 무관하게 동작하도록 이 파일이 직접 컴파일한다.
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
execFileSync(process.execPath, [tsc, "src/features/trash-match/engine.ts", "src/features/trash-match/stages.ts", "src/features/trash-match/progress.ts", "--outDir", ".tmp-puzzle", "--module", "esnext", "--target", "es2020", "--strict", "--skipLibCheck"], { stdio: "inherit" });
mkdirSync(".tmp-puzzle", { recursive: true });
writeFileSync(".tmp-puzzle/package.json", '{"type":"module"}');
// tsc는 확장자 없는 상대 경로를 그대로 내보내므로 Node ESM이 읽을 수 있게 .js를 붙인다
writeFileSync(".tmp-puzzle/progress.js", readFileSync(".tmp-puzzle/progress.js", "utf8").replace(/from "\.\/stages"/g, 'from "./stages.js"'));
const E = await import("../.tmp-puzzle/engine.js");
const S = await import("../.tmp-puzzle/stages.js");
const P = await import("../.tmp-puzzle/progress.js");
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

ok("줄 폭탄: 옮기기만 하면 발동하지 않는다 (매치가 없으면 제자리)", () => {
  const c = mk(); const b = base(c);
  b[4][4] = { ...b[4][4], special: "line-h" };
  assert.equal(E.resolveMove(c, b, [4, 4], [4, 5]), null);
  assert.equal(E.resolveMove(c, b, [4, 4], [3, 4]), null);
});

ok("줄 폭탄: 같은 종류와 함께 맞춰 터질 때 그 줄이 전부 사라진다", () => {
  const c = mk(); const b = base(c);
  set(b, [[3, 0], [3, 1], [3, 3], [4, 2]], 5);
  b[3][2] = { ...b[3][2], kind: 0 }; b[2][2] = { ...b[2][2], kind: 1 };
  b[3][3] = { ...b[3][3], special: "line-h" };
  assert.equal(E.findRuns(b).length, 0, "사전조건");
  const res = E.resolveMove(c, b, [3, 2], [4, 2]);
  assert.ok(res);
  // 줄이 전부 사라지되, 4개를 맞춰 만든 새 줄 폭탄 자리(3,2)는 새 특수 블록으로 남는다
  assert.equal(res.steps[0].cleared.filter(([r]) => r === 3).length, E.COLS - 1);
  assert.deepEqual([res.steps[0].created[0].r, res.steps[0].created[0].c, res.steps[0].created[0].special], [3, 2, "line-h"]);
});

ok("구역 폭탄: 옮기기만 하면 발동하지 않는다", () => {
  const c = mk(); const b = base(c);
  b[4][4] = { ...b[4][4], special: "bomb" };
  assert.equal(E.resolveMove(c, b, [4, 4], [4, 5]), null);
});

ok("구역 폭탄: 같은 종류와 함께 맞춰 터질 때 5×5(25칸)", () => {
  const c = mk(); const b = base(c);
  set(b, [[4, 4], [4, 5], [3, 3]], 1);
  b[4][4] = { ...b[4][4], special: "bomb" };
  assert.equal(E.findRuns(b).length, 0, "사전조건");
  const res = E.resolveMove(c, b, [3, 3], [4, 3]);
  assert.ok(res);
  assert.ok(res.steps[0].cleared.length >= 25, String(res.steps[0].cleared.length));
});

ok("분리수거 폭탄은 바꾸기만 해도 발동한다", () => {
  const c = mk(); const b = base(c);
  b[0][0] = { id: 9998, kind: -1, special: "color" };
  assert.ok(E.resolveMove(c, b, [0, 0], [0, 1]));
});

ok("움직일 곳 판정: 줄·구역 폭탄만 있는 보드는 매치가 없으면 '움직일 곳 없음'", () => {
  const c = mk(); const b = base(c);
  assert.equal(E.hasMove(b), false);
  b[4][4] = { ...b[4][4], special: "line-h" };
  assert.equal(E.hasMove(b), false);
  b[4][4] = { id: 9997, kind: -1, special: "color" };
  assert.equal(E.hasMove(b), true);
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

/* ── 오염(음식물): 씻기고 한 번 더 맞춰야 사라진다 ─────────────────────────── */
// (3,0)(3,1) 이 5, (3,2)에 0을 두고 (4,2)의 5를 올려 가로 3개를 만든다. 사전조건: 처음엔 터질 곳 없음
const dirtySetup = (dirt) => {
  const c = mk(); const b = base(c);
  set(b, [[3, 0], [3, 1], [4, 2]], 5);
  b[3][2] = { ...b[3][2], kind: 0 }; b[2][2] = { ...b[2][2], kind: 1 };
  dirt.forEach(([r, q, d]) => (b[r][q] = { ...b[r][q], dirt: d }));
  assert.equal(E.findRuns(b).length, 0, "사전조건");
  return { c, b };
};

ok("오염 1겹: 3개를 맞추면 그 칸은 사라지지 않고 씻기고, 나머지 두 칸만 사라진다 (WASH)", () => {
  const { c, b } = dirtySetup([[3, 0, 1]]);
  const id = b[3][0].id;
  const res = E.resolveMove(c, b, [3, 2], [4, 2]);
  const s0 = res.steps[0];
  assert.equal(s0.cleared.length, 2, "더러운 칸은 제외");
  assert.equal(s0.washed.length, 1);
  assert.deepEqual([s0.washed[0].id, s0.washed[0].r, s0.washed[0].c, s0.washed[0].dirt], [id, 3, 0, 0]);
  assert.equal(s0.points, 2 * 10 + 15, "지운 칸 20 + 씻기 15");
  const kept = s0.after.flat().find((t) => t.id === id);
  assert.ok(kept, "씻긴 칸은 보드에 남는다"); assert.equal(kept.dirt, 0); assert.equal(kept.kind, 5);
  assert.deepEqual(s0.kindsCleared[5], 2, "씻기만 한 칸은 모으기에 세지 않는다");
});

ok("씻긴 칸은 이번 이동에서 사라지지 않고, 그 칸으로 다음 이동에서 맞추면 사라진다", () => {
  const { c, b } = dirtySetup([[3, 0, 1]]);
  const id = b[3][0].id;
  const s0 = E.resolveMove(c, b, [3, 2], [4, 2]).steps[0];
  const washed = s0.after.flat().find((t) => t.id === id);
  assert.ok(washed && !washed.dirt, "씻긴 칸이 깨끗한 채로 남아 있다");
  // 그 칸을 새 보드에 그대로 두고 같은 모양으로 다시 맞춘다
  const c2 = mk(); const b2 = base(c2);
  set(b2, [[3, 1], [4, 2]], 5);
  b2[3][0] = { ...washed, special: null };
  b2[3][2] = { ...b2[3][2], kind: 0 }; b2[2][2] = { ...b2[2][2], kind: 1 };
  assert.equal(E.findRuns(b2).length, 0, "사전조건");
  const r2 = E.resolveMove(c2, b2, [3, 2], [4, 2]);
  assert.ok(r2.steps[0].cleared.some(([r, q]) => r === 3 && q === 0), "이번에는 사라진다");
  assert.equal(r2.steps[0].washed.length, 0);
  assert.equal(r2.steps[0].cleared.length, 3);
});

ok("오염 3개로만 이뤄진 줄: 모두 씻기고, 깨끗해진 같은 색 3개가 곧바로 다시 맞춰져 사라진다 (연쇄 ×2)", () => {
  const { c, b } = dirtySetup([[3, 0, 1], [3, 1, 1], [4, 2, 1]]);
  const res = E.resolveMove(c, b, [3, 2], [4, 2]);
  const [s0, s1] = res.steps;
  assert.equal(s0.cleared.length, 0); assert.equal(s0.washed.length, 3);
  assert.ok(s1 && !s1.shuffle, "씻긴 뒤 같은 줄이 다시 맞춰진다");
  assert.equal(s1.washed.length, 0); assert.equal(s1.cleared.length, 3);
  assert.equal(s1.chain, 2); assert.equal(s1.multiplier, 2);
  assert.ok(s1.points >= 3 * 10 * 2, "두 번째 연쇄이므로 배수 ×2");
  assert.equal(res.steps.reduce((n, st) => n + st.kindsCleared[5], 0), 3, "모으기 목표에는 사라진 3개만 센다");
  assert.equal(res.dirtLeft, 0);
});

ok("찌든 때(2겹) 3개: 두 번 씻기고 세 번째에 사라진다", () => {
  const { c, b } = dirtySetup([[3, 0, 2], [3, 1, 2], [4, 2, 2]]);
  const res = E.resolveMove(c, b, [3, 2], [4, 2]);
  const real = res.steps.filter((st) => !st.shuffle);
  assert.deepEqual(real.slice(0, 3).map((st) => [st.washed.length, st.cleared.length]), [[3, 0], [3, 0], [0, 3]]);
  assert.deepEqual(real[0].washed.map((w) => w.dirt), [1, 1, 1]); assert.deepEqual(real[1].washed.map((w) => w.dirt), [0, 0, 0]);
});

ok("더러운 칸이 일부만 낀 줄: 깨끗한 칸은 사라지고, 더러운 칸만 씻겨 남는다 (남은 칸이 혼자라 더 이어지지 않는다)", () => {
  const { c, b } = dirtySetup([[3, 0, 1], [3, 1, 1]]); // 3개 중 2개가 더럽다
  const [s0] = E.resolveMove(c, b, [3, 2], [4, 2]).steps;
  assert.equal(s0.washed.length, 2); assert.equal(s0.cleared.length, 1);
});

ok("찌든 때(2겹): 한 번 맞추면 1겹이 남고, 두 번째에야 깨끗해진다", () => {
  const { c, b } = dirtySetup([[3, 0, 2]]);
  const id = b[3][0].id;
  const s0 = E.resolveMove(c, b, [3, 2], [4, 2]).steps[0];
  assert.deepEqual([s0.washed[0].id, s0.washed[0].dirt], [id, 1]);
  assert.equal(s0.after.flat().find((t) => t.id === id).dirt, 1);
});

ok("분리수거 폭탄: 그 종류의 오염 칸은 사라지지 않고 씻긴다", () => {
  const c = mk(); const b = base(c);
  b[0][0] = { id: 9999, kind: -1, special: "color" };
  const target = b[0][1].kind;
  const cells = []; b.forEach((row, r) => row.forEach((t, q) => t.kind === target && cells.push([r, q])));
  const dirty = cells.slice(1, 3);
  dirty.forEach(([r, q]) => (b[r][q] = { ...b[r][q], dirt: 1 }));
  const res = E.resolveMove(c, b, [0, 0], [0, 1]);
  const s0 = res.steps[0];
  assert.equal(s0.washed.length, dirty.length);
  dirty.forEach(([r, q]) => assert.ok(!s0.cleared.some(([a, d]) => a === r && d === q), "더러운 칸은 지워지지 않는다"));
});

ok("특수 블록은 더러운 칸에 만들지 않는다 (깨끗한 칸으로 옮겨 만든다)", () => {
  const c = mk(); const b = base(c);
  set(b, [[3, 0], [3, 1], [3, 3], [4, 2]], 5);
  b[3][2] = { ...b[3][2], kind: 0 }; b[2][2] = { ...b[2][2], kind: 1 };
  b[4][2] = { ...b[4][2], dirt: 1 }; // 방금 바꿔 넣는 칸이 더럽다
  assert.equal(E.findRuns(b).length, 0, "사전조건");
  const res = E.resolveMove(c, b, [3, 2], [4, 2]);
  const m = res.steps[0].created[0];
  assert.ok(m, "4개 → 줄 폭탄");
  assert.ok(!res.steps[0].after[m.r][m.c].dirt, "더러운 칸이 아니다");
  assert.equal(res.steps[0].washed.length, 1);
});

ok("오염 확률: 0이면 오염 없음(예전과 같은 보드), 높으면 생기고, dirtMax 2일 때만 2겹이 나온다", () => {
  const count = (ctxExtra, n = 40) => {
    let d1 = 0, d2 = 0, total = 0;
    for (let s = 1; s <= n; s++) E.createBoard({ ...mk(s), ...ctxExtra }).flat().forEach((t) => { total++; if (t.dirt === 1) d1++; if (t.dirt === 2) d2++; });
    return { d1, d2, total };
  };
  const none = count({}); assert.equal(none.d1 + none.d2, 0);
  const a = E.createBoard(mk(5)), b = E.createBoard({ ...mk(5), dirtRate: 0 });
  assert.deepEqual(a.map((r) => r.map((t) => t.kind)), b.map((r) => r.map((t) => t.kind)));
  const one = count({ dirtRate: 0.3, dirtMax: 1 }); assert.equal(one.d2, 0);
  assert.ok(one.d1 / one.total > 0.2 && one.d1 / one.total < 0.4, `${one.d1 / one.total}`);
  const two = count({ dirtRate: 0.3, dirtMax: 2 }); assert.ok(two.d2 > 0 && two.d1 > 0);
  const k5 = E.createBoard({ ...mk(3), kinds: 5 }); assert.ok(k5.flat().every((t) => t.kind < 5), "kinds=5면 0~4만 나온다");
});

ok("오염이 있는 판 시뮬레이션: 빈칸·중복 id 없음, 끝난 보드는 안정, 움직일 곳 있음", () => {
  let moves = 0, washes = 0;
  for (let s = 1; s <= 120; s++) {
    const c = { ...mk(s), kinds: 6, dirtRate: 0.25, dirtMax: 2 };
    let b = E.createBoard(c);
    for (let step = 0; step < 6; step++) {
      const cands = [];
      for (let r = 0; r < E.ROWS; r++) for (let q = 0; q < E.COLS; q++) { if (q + 1 < E.COLS) cands.push([[r, q], [r, q + 1]]); if (r + 1 < E.ROWS) cands.push([[r, q], [r + 1, q]]); }
      const res = cands.map(([x, y]) => E.resolveMove({ ...c, rng: lcg(s + step) }, b, x, y)).find(Boolean);
      if (!res) break;
      const real = cands.find(([x, y]) => E.resolveMove({ ...c, rng: lcg(s + step) }, b, x, y));
      const out = E.resolveMove(c, b, real[0], real[1]);
      moves++; washes += out.steps.reduce((n, st) => n + st.washed.length, 0);
      const ids = out.final.flat().map((t) => t.id);
      assert.equal(new Set(ids).size, ids.length, "id 중복 없음");
      assert.ok(out.final.flat().every((t) => t && (t.dirt ?? 0) >= 0 && (t.dirt ?? 0) <= 2));
      assert.equal(E.findRuns(out.final).length, 0, "끝난 보드에 맞춰진 줄이 남지 않는다");
      assert.ok(E.hasMove(out.final), "새로 만들 수 있는 줄이 있다");
      b = out.final;
    }
  }
  console.log("   오염 시뮬레이션 이동", moves, "회, 씻기", washes, "회");
  assert.ok(washes > 50);
});


ok("남아 있는 줄(씻긴 칸이 낀 줄)은 헛손질을 성공으로 만들지 않고, 다음 성공 이동에서 함께 사라진다", () => {
  const c = mk(); const b = base(c);
  // 이미 맞춰져 있는 가로 줄(5 5 5)이 있는 보드 — 씻긴 칸이 낀 줄이 남은 상태를 흉내 낸다
  set(b, [[7, 0], [7, 1], [7, 2]], 5);
  b[7][3] = { ...b[7][3], kind: 0 }; b[6][3] = { ...b[6][3], kind: 1 };
  assert.equal(E.findRuns(b).length, 1);
  assert.equal(E.resolveMove(c, b, [0, 0], [0, 1]), null, "새 줄이 안 생기는 교환은 그대로 실패");
  // 다른 곳에서 새 줄을 만들면 남아 있던 줄도 함께 사라진다
  set(b, [[3, 0], [3, 1], [4, 2]], 4); b[3][2] = { ...b[3][2], kind: 0 }; b[2][2] = { ...b[2][2], kind: 1 };
  const res = E.resolveMove(c, b, [3, 2], [4, 2]);
  assert.ok(res);
  assert.ok(res.steps[0].cleared.some(([r]) => r === 7), "남아 있던 줄도 사라진다");
});


ok("씻긴 칸 위로 새 칸이 떨어져 이룬 새 줄은 같은 이동에서 정상적으로 사라진다 (화면 버그 재현)", () => {
  const c = mk(); const b = base(c);
  // 5행에 5 5 5 (가운데는 더러움). 위의 (4,0)·(4,2)도 5라서, 씻기고 나면 떨어져 내려와 5 W 5 가 된다
  set(b, [[5, 0], [5, 1], [6, 2], [4, 0], [4, 2]], 5);
  b[5][1] = { ...b[5][1], dirt: 1 };
  assert.equal(E.findRuns(b).length, 0, "사전조건");
  const res = E.resolveMove(c, b, [5, 2], [6, 2]);
  const [s0, s1] = res.steps;
  assert.equal(s0.washed.length, 1); assert.equal(s0.cleared.length, 2);
  assert.ok(s1 && !s1.shuffle, "새 줄이 연쇄로 이어진다");
  assert.ok(s1.cleared.some(([r, q]) => r === 5 && q === 1), "씻겨 깨끗해진 칸도 새 줄에 들어가 사라진다");
  assert.equal(s1.washed.length, 0);
});

/* ── 스테이지 · 벌점 · 별 · 진행 저장 ───────────────────────────────────── */
ok("스테이지 30개: 레벨별 10개, 목표·시간·종류가 올바르고 난이도가 오른다", () => {
  assert.equal(S.allStages().length, 30);
  for (const lv of S.LEVELS) {
    const rows = Array.from({ length: 10 }, (_, i) => S.getStage(lv, i + 1));
    rows.forEach((st, i) => {
      assert.equal(st.no, i + 1); assert.ok(st.time >= 30 && st.maxTime > st.time);
      assert.ok(st.kinds >= 5 && st.kinds <= 6);
      if (st.goal.collect) { assert.ok(st.goal.collect.kind < st.kinds, "나오지 않는 종류를 모으라고 하지 않는다"); assert.ok(st.goal.collect.n > 0); }
      if (i > 0) { assert.ok(st.goal.score > rows[i - 1].goal.score, "점수 목표는 계속 오른다"); assert.ok(st.dirtRate >= rows[i - 1].dirtRate); assert.ok(st.time <= rows[i - 1].time); }
    });
  }
  const [e, n, h] = S.LEVELS.map((lv) => S.getStage(lv, 5));
  assert.ok(e.missPenalty <= n.missPenalty && n.missPenalty < h.missPenalty, "어려울수록 오분리 벌점 증가");
  assert.ok(e.leak < n.leak && n.leak < h.leak, "어려울수록 오염 방치 벌점 증가");
  assert.ok(h.missTime > 0 && e.missTime === 0);
  assert.ok(S.getStage("easy", 10).dirtMax === 1 && S.getStage("hard", 10).dirtMax === 2);
  assert.ok(S.getStage("easy", 1).dirtRate === 0, "첫 스테이지는 오염 없음");
  assert.throws(() => S.getStage("easy", 11)); assert.throws(() => S.getStage("easy", 0));
});

ok("목표 판정·벌점·별: 점수 + 모으기 + 씻기를 모두 채워야 클리어", () => {
  const st = S.getStage("easy", 6); // 점수 1150 · 캔 14개 · 씻기 4
  const p = { score: 2000, collected: 14, washes: 3 };
  assert.equal(S.isCleared(st, p), false);
  assert.equal(S.isCleared(st, { ...p, washes: 4 }), true);
  assert.equal(S.isCleared(st, { ...p, collected: 13, washes: 4 }), false);
  assert.deepEqual(S.goalLines(st, S.emptyProgress()).map((l) => l.id), ["score", "collect", "wash"]);
  assert.deepEqual(S.goalLines(S.getStage("easy", 1), S.emptyProgress()).map((l) => l.id), ["score"]);

  const hard = S.getStage("hard", 4);
  assert.deepEqual(S.penaltyFor(hard, false, 99), { points: 15, seconds: 1 });
  assert.deepEqual(S.penaltyFor(hard, true, 3), { points: 9, seconds: 0 });
  assert.equal(S.penaltyFor(hard, true, 99).points, 3 * S.LEAK_CAP, "칸 수는 최대 8칸까지만");
  assert.deepEqual(S.penaltyFor(S.getStage("easy", 9), false, 5), { points: 0, seconds: 0 });
  assert.equal(S.penaltyFor(S.getStage("easy", 9), true, 5).points, 0, "쉬움은 오염을 방치해도 벌점 없음");

  const g = S.getStage("normal", 1).goal.score; // 1000
  assert.equal(S.starsFor(S.getStage("normal", 1), g - 1), 0);
  assert.equal(S.starsFor(S.getStage("normal", 1), g), 1);
  assert.equal(S.starsFor(S.getStage("normal", 1), g * 1.3), 2);
  assert.equal(S.starsFor(S.getStage("normal", 1), g * 1.6), 3);
  assert.equal(S.finalScore(S.getStage("hard", 1), 1000, 12.4), 1000 + 124, "어려움은 1초 10점");
  assert.equal(S.finalScore(S.getStage("easy", 1), 1000, -3), 1000, "남은 시간이 음수면 보너스 없음");
});

ok("진행 저장: 깨진 저장값·잘못된 별은 0으로, 앞 스테이지를 깨야 열리고, 별은 높은 값만 남는다", () => {
  assert.deepEqual(P.parseTrail(null), P.emptyTrail());
  assert.deepEqual(P.parseTrail("{깨진 json"), P.emptyTrail());
  const t = P.parseTrail(JSON.stringify({ easy: [3, 2, 9, "x", 1.5, -1], normal: "no", hard: null, extra: [3] }));
  assert.deepEqual(t.easy, [3, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(t.normal, Array(10).fill(0));
  assert.ok(P.isUnlocked(t, "easy", 1) && P.isUnlocked(t, "easy", 3) && !P.isUnlocked(t, "easy", 4));
  assert.ok(P.isUnlocked(P.emptyTrail(), "hard", 1) && !P.isUnlocked(P.emptyTrail(), "hard", 2));
  let r = P.record(P.emptyTrail(), "normal", 1, 2);
  r = P.record(r, "normal", 1, 1); assert.equal(r.normal[0], 2, "낮은 별로 덮어쓰지 않는다");
  r = P.record(r, "normal", 1, 3); assert.equal(r.normal[0], 3);
  assert.ok(P.isUnlocked(r, "normal", 2));
  assert.equal(P.clearedCount(r, "normal"), 1); assert.equal(P.totalStars(r), 3);
  assert.equal(P.emptyTrail().easy.length, 10);
});

ok("스테이지 모두 첫 판이 시작된다: 30개 스테이지 설정으로 보드를 만들 수 있다", () => {
  for (const st of S.allStages()) for (let seed = 1; seed <= 10; seed++) {
    const c = { ...mk(seed), kinds: st.kinds, dirtRate: st.dirtRate, dirtMax: st.dirtMax };
    const b = E.createBoard(c);
    assert.equal(E.findRuns(b).length, 0); assert.ok(E.hasMove(b));
  }
});

console.log("ALL PASSED");
