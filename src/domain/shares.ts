import type { Action } from "./types";

/** 目標に紐づかない防御系の行動(支払い・片付け・連絡など)をまとめた枠 */
export const LIFE = "life";
/** 目標に紐づかない攻撃系の行動(散歩・読書など)をまとめた枠 */
export const FREE = "free";

/** 1つの枠の最小割合(%)。円グラフの境界が重ならないようにする */
export const MIN_SHARE = 4;

/** 行動が属する枠: 目標があれば目標 / なければ くらし(防御) か そのほか(攻撃) */
export function groupOf(a: Pick<Action, "goalId" | "kind">): string {
  if (a.goalId) return a.goalId;
  return a.kind === "defense" ? LIFE : FREE;
}

/**
 * 円グラフの枠(キー)を並べる。目標(goalOrder の順) → くらし → そのほか。
 * 有効な行動が1つもない枠は出さない。
 */
export function sliceKeys(actions: Action[], goalOrder: string[] = []): string[] {
  const present = new Set<string>();
  for (const a of actions) if (!a.archived) present.add(groupOf(a));
  const goals = goalOrder.filter((g) => present.has(g));
  const otherGoals = [...present].filter((k) => k !== LIFE && k !== FREE && !goalOrder.includes(k));
  return [...goals, ...otherGoals, ...(present.has(LIFE) ? [LIFE] : []), ...(present.has(FREE) ? [FREE] : [])];
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** 合計がちょうど100になる整数(%)にする(最大剰余法) */
function toPercents(weights: number[]): number[] {
  const total = sum(weights);
  if (weights.length === 0) return [];
  if (total <= 0) return equalPercents(weights.length);
  const exact = weights.map((w) => (w / total) * 100);
  const floor = exact.map(Math.floor);
  let rest = 100 - sum(floor);
  const order = exact.map((e, i) => [e - floor[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) floor[order[k][1]]++;
  return floor;
}

/** 最小割合に満たない枠を引き上げ、その分を一番大きい枠から引く */
function ensureMin(p: number[]): number[] {
  if (p.length * MIN_SHARE > 100) return p;
  const out = [...p];
  for (let i = 0; i < out.length; i++) {
    while (out[i] < MIN_SHARE) {
      const big = out.reduce((m, v, j) => (v > out[m] ? j : m), 0);
      if (out[big] <= MIN_SHARE) return out;
      out[big]--;
      out[i]++;
    }
  }
  return out;
}

export function equalPercents(n: number): number[] {
  if (n === 0) return [];
  const base = Math.floor(100 / n);
  const out = Array<number>(n).fill(base);
  for (let i = 0; i < 100 - base * n; i++) out[i]++;
  return out;
}

/**
 * 保存されている配分(%)を、いまの枠(keys)に合わせて合計100%に整える。
 * - 何も保存されていなければ初期値: くらし20% / そのほか10% / 残りを目標で等分
 * - あとから増えた枠は、均等割りぶんを確保して既存の枠を比例して縮める
 * - 消えた枠は捨てる
 */
export function normalizeShares(raw: Record<string, number> | undefined, keys: string[]): Record<string, number> {
  if (keys.length === 0) return {};
  const known = keys.filter((k) => (raw?.[k] ?? 0) > 0);
  const knownTotal = sum(known.map((k) => raw![k]));
  let weights: number[];
  if (known.length === 0 || knownTotal <= 0) {
    const goals = keys.filter((k) => k !== LIFE && k !== FREE);
    weights = keys.map((k) => (k === LIFE ? 20 : k === FREE ? 10 : 70 / goals.length));
  } else {
    const missing = keys.filter((k) => !known.includes(k));
    const each = 100 / keys.length;
    const scale = (100 - each * missing.length) / knownTotal;
    weights = keys.map((k) => (known.includes(k) ? raw![k] * scale : each));
  }
  const percents = ensureMin(toPercents(weights));
  return Object.fromEntries(keys.map((k, i) => [k, percents[i]]));
}

/**
 * 円グラフの境界 b(1〜n-1。枠 b-1 と枠 b のあいだ)を、先頭からの累計 target(%) へ動かす。
 * 両隣の枠が MIN_SHARE を下回らない範囲に収める。それ以外の枠は動かさない。
 */
export function moveBoundary(percents: number[], b: number, target: number): number[] {
  if (b < 1 || b >= percents.length) return percents;
  const before = sum(percents.slice(0, b - 1));
  const upto = sum(percents.slice(0, b + 1));
  const lo = before + MIN_SHARE;
  const hi = upto - MIN_SHARE;
  if (lo > hi) return percents;
  const t = Math.min(hi, Math.max(lo, Math.round(target)));
  const next = [...percents];
  next[b - 1] = t - before;
  next[b] = upto - t;
  return next;
}
