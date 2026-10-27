/**
 * 분리배출 퍼즐 규칙 엔진 (3-매치). React·DOM을 전혀 모르는 순수 함수라 따로 테스트할 수 있다.
 *
 * 종류 6가지(0 비닐 · 1 플라스틱 · 2 캔 · 3 종이 · 4 유리 · 5 일반) 중 같은 것 3개 이상이 가로·세로로 이어지면 터진다.
 * 특수 블록
 *   4개 한 줄        → 줄 폭탄(line-h/line-v): 같은 종류와 함께 맞춰 터질 때 그 줄 전체가 사라진다
 *   L·T자(가로+세로) → 구역 폭탄(bomb): 같은 종류와 함께 맞춰 터질 때 주변 5×5가 사라진다
 *   5개 이상 한 줄   → 분리수거 폭탄(color): 색이 없어서 맞출 수 없고, 옆 칸과 바꾸면 그 종류가 전부 사라진다
 * 줄·구역 폭탄은 옮기기만 해서는 발동하지 않는다 (같은 종류 3개 이상에 포함되어야 한다).
 * 매치를 만들지 못하는 교환은 되돌린다.
 * 연쇄(콤보): 한 번의 이동에서 연달아 터질 때마다 점수 배수 ×1 → ×2 → ×3 → ×4(최대)
 *
 * 오염(dirt): 음식물이 묻은 쓰레기. 같은 종류 3개 이상에 포함되거나 폭발에 휘말리면 **바로 사라지지 않고 한 겹 씻긴다**("wash!").
 *   dirt 1 → 씻으면 깨끗해지고 제자리에 남는다 / dirt 2(찌든 때) → 두 번 씻어야 깨끗해진다.
 *   깨끗해진 칸은 **다음 이동에서** 다시 3개 이상 맞춰야 사라진다. 한 번의 이동(연쇄 포함) 안에서는 같은 칸을 두 번 씻거나 지우지 않는다.
 *   씻긴 칸이 같이 맞춰진 나머지 칸은 평소처럼 사라진다.
 */
export const ROWS = 8;
export const COLS = 8;
export const KINDS = 6;
export const START_TIME = 60;
export const MAX_TIME = 90;

export type Special = "line-h" | "line-v" | "bomb" | "color" | null;
/** kind -1 은 분리수거 폭탄(어떤 종류와도 매치되지 않는다) */
export type Tile = { id: number; kind: number; special: Special; /** 0/없음 = 깨끗함, 1 = 음식물, 2 = 찌든 때 */ dirt?: number };
export type Board = (Tile | null)[][];
export type Cell = [number, number];
export type Rng = () => number;
export type Ctx = {
  rng: Rng;
  nextId: number;
  /** 이번 판에 나오는 쓰레기 종류 수 (기본 6) */
  kinds?: number;
  /** 새로 생기는 칸이 오염되어 있을 확률 (기본 0) */
  dirtRate?: number;
  /** 2면 찌든 때(두 겹)도 나온다 */
  dirtMax?: 1 | 2;
};

export type Step = {
  /** 몇 번째 연쇄인지 (0 = 섞기) */
  chain: number;
  multiplier: number;
  /** 사라지는 칸 (새로 만들어지는 특수 블록 자리는 제외) */
  cleared: Cell[];
  /** 씻겨서 사라지지 않고 남은 칸. dirt = 씻은 뒤 남은 때(0이면 깨끗) */
  washed: { id: number; r: number; c: number; dirt: number }[];
  /** 종류별로 사라진 개수 (씻기만 한 칸은 세지 않는다) */
  kindsCleared: number[];
  /** 같은 id의 타일이 특수 블록으로 바뀐다 */
  created: { id: number; r: number; c: number; special: Exclude<Special, null> }[];
  /** 중력·새 블록 채우기까지 끝난 보드 */
  after: Board;
  points: number;
  bonusTime: number;
  shuffle?: boolean;
};

const key = (r: number, c: number) => r * COLS + c;
const inRange = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

export const multiplierFor = (chain: number) => Math.min(Math.max(chain, 1), 4);
export const kindsOf = (ctx: Ctx) => Math.min(Math.max(ctx.kinds ?? KINDS, 3), KINDS);
export const newTile = (ctx: Ctx, kind = Math.floor(ctx.rng() * kindsOf(ctx))): Tile => {
  const t: Tile = { id: ctx.nextId++, kind, special: null };
  // 난수는 오염 확률이 있을 때만 쓴다 → 오염을 쓰지 않는 판은 예전과 똑같이 만들어진다
  if (ctx.dirtRate && ctx.rng() < ctx.dirtRate) t.dirt = ctx.dirtMax === 2 && ctx.rng() < 0.35 ? 2 : 1;
  return t;
};
export const dirtCount = (b: Board) => b.reduce((n, row) => n + row.filter((t) => t && (t.dirt ?? 0) > 0).length, 0);

const clone = (b: Board): Board => b.map((row) => row.slice());

/* ── 매치 찾기 ─────────────────────────────────────────────────── */
type Run = { kind: number; dir: "h" | "v"; cells: Cell[] };

export function findRuns(b: Board): Run[] {
  const runs: Run[] = [];
  const kindAt = (r: number, c: number) => { const t = b[r][c]; return t ? t.kind : -2; };
  const scan = (len: number, at: (i: number) => Cell, dir: "h" | "v") => {
    let start = 0;
    for (let i = 1; i <= len; i++) {
      const prev = kindAt(...at(start));
      const cur = i < len ? kindAt(...at(i)) : -2;
      if (cur >= 0 && prev >= 0 && cur === prev) continue;
      if (prev >= 0 && i - start >= 3) {
        runs.push({ kind: prev, dir, cells: Array.from({ length: i - start }, (_, k) => at(start + k)) });
      }
      start = i;
    }
  };
  for (let r = 0; r < ROWS; r++) scan(COLS, (i) => [r, i], "h");
  for (let c = 0; c < COLS; c++) scan(ROWS, (i) => [i, c], "v");
  return runs;
}

/**
 * 씻긴 칸은 그 이동 안에서는 맞춰지지 않으므로, 이동이 끝난 보드에 "이미 맞춰져 있는 줄"이 남을 수 있다(씻긴 칸 + 떨어진 칸).
 * 그 줄은 다음에 성공하는 이동에서 함께 사라지지만, 헛손질(새로 생기는 줄이 없는 교환)을 성공으로 만들어 주지는 않는다.
 */
const runKey = (r: Run) => `${r.kind}${r.dir}:${r.cells.map(([a, b]) => a * COLS + b).join(",")}`;
const hasNewRun = (standing: Set<string>, after: Run[]) => after.some((r) => !standing.has(runKey(r)));

type Group = { cells: Map<number, Cell>; runs: Run[] };

/** 서로 겹치는 줄(L·T자)은 한 묶음으로 본다 */
function groupRuns(runs: Run[]): Group[] {
  const groups: Group[] = [];
  for (const run of runs) {
    const hit = groups.filter((g) => run.cells.some(([r, c]) => g.cells.has(key(r, c)) && g.runs[0].kind === run.kind));
    const merged: Group = { cells: new Map(), runs: [run] };
    run.cells.forEach(([r, c]) => merged.cells.set(key(r, c), [r, c]));
    for (const g of hit) {
      g.cells.forEach((v, k) => merged.cells.set(k, v));
      merged.runs.push(...g.runs);
      groups.splice(groups.indexOf(g), 1);
    }
    groups.push(merged);
  }
  return groups;
}

/* ── 보드 만들기 ───────────────────────────────────────────────── */
export function hasMove(b: Board): boolean {
  const standing = new Set(findRuns(b).map(runKey));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (!inRange(r2, c2)) continue;
        const t = clone(b);
        [t[r][c], t[r2][c2]] = [t[r2][c2], t[r][c]];
        if (t[r][c]?.special === "color" || t[r2][c2]?.special === "color" || hasNewRun(standing, findRuns(t))) return true;
      }
    }
  }
  return false;
}

/** 처음부터 터져 있는 곳이 없고, 움직일 곳이 하나는 있는 보드 */
export function createBoard(ctx: Ctx): Board {
  for (let attempt = 0; attempt < 100; attempt++) {
    const b: Board = Array.from({ length: ROWS }, () => Array<Tile | null>(COLS).fill(null));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let kind: number;
        do {
          kind = Math.floor(ctx.rng() * kindsOf(ctx));
        } while (
          (c >= 2 && b[r][c - 1]?.kind === kind && b[r][c - 2]?.kind === kind) ||
          (r >= 2 && b[r - 1][c]?.kind === kind && b[r - 2][c]?.kind === kind)
        );
        b[r][c] = newTile(ctx, kind);
      }
    }
    if (hasMove(b)) return b;
  }
  throw new Error("보드를 만들지 못했습니다.");
}

/* ── 한 번의 이동 처리 ─────────────────────────────────────────── */
function mostCommonKind(b: Board): number {
  const n = Array<number>(KINDS).fill(0);
  b.forEach((row) => row.forEach((t) => t && t.kind >= 0 && n[t.kind]++));
  return n.indexOf(Math.max(...n));
}

function blast(b: Board, r: number, c: number, t: Tile, colorTarget?: number): Cell[] {
  const out: Cell[] = [];
  if (t.special === "line-h") for (let i = 0; i < COLS; i++) out.push([r, i]);
  else if (t.special === "line-v") for (let i = 0; i < ROWS; i++) out.push([i, c]);
  else if (t.special === "bomb") {
    for (let i = r - 2; i <= r + 2; i++) for (let j = c - 2; j <= c + 2; j++) if (inRange(i, j)) out.push([i, j]);
  } else if (t.special === "color") {
    const kind = colorTarget ?? mostCommonKind(b);
    b.forEach((row, i) => row.forEach((x, j) => x && x.kind === kind && out.push([i, j])));
  }
  return out;
}

/**
 * a, b 두 칸을 바꿔 본다. 아무것도 터지지 않으면 null(원래대로 되돌린다).
 * 성공하면 연쇄 단계별 결과(steps)와 최종 보드를 돌려준다.
 */
export function resolveMove(ctx: Ctx, board: Board, a: Cell, b: Cell): { steps: Step[]; final: Board; dirtLeft: number } | null {
  let cur = clone(board);
  const ta = cur[a[0]][a[1]], tb = cur[b[0]][b[1]];
  if (!ta || !tb) return null;
  const standing = new Set(findRuns(board).map(runKey));
  cur[a[0]][a[1]] = tb;
  cur[b[0]][b[1]] = ta;

  // 분리수거 폭탄만 바꿔 넣는 것으로 발동한다 (맞바꾼 종류를 모두 지운다).
  // 줄·구역 폭탄은 같은 종류와 함께 맞춰 터질 때만 발동하므로 여기서는 건드리지 않는다.
  const forced: Cell[] = [];
  const colorTarget = new Map<number, number>();
  const trigger = (self: Tile, at: Cell, partner: Tile) => {
    if (self.special !== "color") return;
    forced.push(at);
    if (partner.kind >= 0) colorTarget.set(key(at[0], at[1]), partner.kind);
  };
  trigger(ta, b, tb); // ta는 이제 b 칸에 있다
  trigger(tb, a, ta);

  if (!hasNewRun(standing, findRuns(cur)) && forced.length === 0) return null;

  const steps: Step[] = [];
  let chain = 0;
  let pending = forced;

  for (;;) {
    const runs = findRuns(cur);
    if (runs.length === 0 && pending.length === 0) break;
    chain++;

    const clear = new Map<number, Cell>();
    const expanded = new Set<number>();
    const created: Step["created"] = [];
    const groups = groupRuns(runs);

    for (const g of groups) {
      g.cells.forEach((v, k) => clear.set(k, v));
      const longest = g.runs.reduce((m, r) => (r.cells.length > m.cells.length ? r : m), g.runs[0]);
      const hasH = g.runs.some((r) => r.dir === "h"), hasV = g.runs.some((r) => r.dir === "v");
      let special: Special = null;
      if (longest.cells.length >= 5) special = "color";
      else if (hasH && hasV) special = "bomb";
      else if (longest.cells.length === 4) special = longest.dir === "h" ? "line-h" : "line-v";
      if (!special) continue;

      // 만들어지는 자리: 방금 바꾼 칸(첫 연쇄) → 가로·세로가 겹치는 칸 → 가운데
      let pos: Cell | null = null;
      if (chain === 1) pos = [a, b].find(([r, c]) => g.cells.has(key(r, c))) ?? null;
      if (!pos && special === "bomb") {
        const hCells = new Set(g.runs.filter((r) => r.dir === "h").flatMap((r) => r.cells.map(([r2, c2]) => key(r2, c2))));
        pos = g.runs.filter((r) => r.dir === "v").flatMap((r) => r.cells).find(([r2, c2]) => hCells.has(key(r2, c2))) ?? null;
      }
      if (!pos) pos = longest.cells[Math.floor(longest.cells.length / 2)];
      // 더러운 칸에는 특수 블록을 만들지 않는다 (씻기고 남아야 하므로) → 같은 묶음의 깨끗한 칸으로 옮긴다
      let t = cur[pos[0]][pos[1]];
      if (t && (t.dirt ?? 0) > 0) {
        const clean = [...g.cells.values()].find(([r, c]) => !(cur[r][c]?.dirt) && !cur[r][c]?.special);
        if (clean) { pos = clean; t = cur[pos[0]][pos[1]]; } else t = null;
      }
      if (t && !t.special) created.push({ id: t.id, r: pos[0], c: pos[1], special });
    }

    // 특수 블록이 섞여 있으면 연쇄로 함께 터진다
    const queue: Cell[] = [...clear.values(), ...pending];
    pending.forEach(([r, c]) => clear.set(key(r, c), [r, c]));
    const fired = new Set<number>();
    while (queue.length) {
      const [r, c] = queue.pop()!;
      const t = cur[r][c];
      if (!t?.special || fired.has(key(r, c))) continue;
      fired.add(key(r, c));
      for (const [r2, c2] of blast(cur, r, c, t, colorTarget.get(key(r, c)))) {
        const k = key(r2, c2);
        if (!clear.has(k)) { clear.set(k, [r2, c2]); expanded.add(k); queue.push([r2, c2]); }
      }
    }
    pending = [];

    // 매치로 만든 자리는 폭발 범위여도 새 특수 블록으로 남는다. 다른 특수 블록의 폭발로만 지워지는 자리에는 만들지 않는다
    const keep = created.filter((m) => !expanded.has(key(m.r, m.c)) && !fired.has(key(m.r, m.c)));
    keep.forEach((m) => clear.delete(key(m.r, m.c)));

    // 오염: 지워질 칸이 더러우면 사라지는 대신 한 겹 씻기고 남는다. 씻겨서 깨끗해진 칸이 다시 3개 이상 이어져 있으면
    // 다음 연쇄 단계에서 곧바로 맞춰져 사라진다(예: 3개가 모두 더러우면 → 씻기고 → 같은 줄이 다시 맞춰져 사라짐).
    const washed: Step["washed"] = [];
    for (const [k, [r, c]] of [...clear.entries()]) {
      const t = cur[r][c]!;
      if ((t.dirt ?? 0) > 0) {
        clear.delete(k);
        washed.push({ id: t.id, r, c, dirt: (t.dirt ?? 1) - 1 });
      }
    }
    const kindsCleared = Array<number>(KINDS).fill(0);
    clear.forEach(([r, c]) => { const t = cur[r][c]; if (t && t.kind >= 0) kindsCleared[t.kind]++; });

    const mult = multiplierFor(chain);
    const n = clear.size;
    const points = n * 10 * mult + keep.length * 50 + (chain >= 3 ? 50 * chain : 0) + washed.length * 15;
    const bonusTime = Math.min(3, n * 0.2 + washed.length * 0.3) + (chain >= 2 ? chain - 1 : 0);

    // 적용: 지우기 → 특수 블록 만들기 → 중력 → 새 블록
    const next = clone(cur);
    clear.forEach(([r, c]) => (next[r][c] = null));
    keep.forEach((m) => {
      const t = next[m.r][m.c]!;
      next[m.r][m.c] = { id: t.id, kind: m.special === "color" ? -1 : t.kind, special: m.special };
    });
    washed.forEach((w) => { next[w.r][w.c] = { ...next[w.r][w.c]!, dirt: w.dirt }; });
    for (let c = 0; c < COLS; c++) {
      const col: Tile[] = [];
      for (let r = ROWS - 1; r >= 0; r--) if (next[r][c]) col.push(next[r][c]!);
      while (col.length < ROWS) col.push(newTile(ctx));
      for (let r = ROWS - 1, i = 0; r >= 0; r--, i++) next[r][c] = col[i];
    }

    steps.push({ chain, multiplier: mult, cleared: [...clear.values()], washed, kindsCleared, created: keep, after: next, points, bonusTime });
    cur = next;
  }

  // 더 움직일 곳이 없으면 섞는다
  if (!hasMove(cur)) {
    const fresh = createBoard(ctx);
    const all: Cell[] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) all.push([r, c]);
    steps.push({ chain: 0, multiplier: 1, cleared: all, washed: [], kindsCleared: Array<number>(KINDS).fill(0), created: [], after: fresh, points: 0, bonusTime: 0, shuffle: true });
    cur = fresh;
  }
  return { steps, final: cur, dirtLeft: dirtCount(cur) };
}
