import type { Action, Draw, Mood, MonthPlan, Rarity, WeekPlan } from "./types";
import { HOUR, daysBetween, daysUntil, weekStartOf, parseYmd } from "./dates";

export interface EngineInput {
  actions: Action[];
  draws: Draw[];
  month?: MonthPlan;
  week?: WeekPlan;
  mood: Mood;
  now: Date;
}

export interface Candidate {
  action: Action;
  weight: number;
  rarity: Rarity;
  reasons: string[];
}

export interface DrawPlan {
  /** 防御行動を引く確率 */
  pDefense: number;
  /** 防御の必要量(0〜1)。期限・損失・間隔から算出 */
  defensePressure: number;
  defense: Candidate[];
  offense: Candidate[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function lastDoneAt(actionId: string, draws: Draw[]): number | undefined {
  let last: number | undefined;
  for (const d of draws) {
    if (d.actionId === actionId && d.outcome === "done") {
      const t = d.resolvedAt ?? d.at;
      if (last === undefined || t > last) last = t;
    }
  }
  return last;
}

/** 防御行動の必要度。0=今は不要 / 1=そろそろ / 1.5=放置すると痛い */
export function defenseNeed(a: Action, draws: Draw[], now: Date): { need: number; reason?: string } {
  const lossFactor = a.loss / 2;
  if (a.deadline) {
    const d = daysUntil(a.deadline, now);
    if (d < 0) return { need: 1.5 * lossFactor, reason: `期限を${-d}日過ぎています` };
    const need = (1 / (1 + d / 3)) * lossFactor;
    return { need, reason: d === 0 ? "今日が期限" : `期限まであと${d}日` };
  }
  if (a.intervalDays) {
    // 未実施なら「間隔の3/4が経過済み」とみなし、初日から防御で埋まらないようにする
    const last = lastDoneAt(a.id, draws) ?? a.createdAt - a.intervalDays * 0.75 * 24 * HOUR;
    const ratio = daysBetween(last, now.getTime()) / a.intervalDays;
    const need = clamp(ratio - 0.5, 0, 1.5) * lossFactor;
    const reason = ratio >= 1 ? `いつもの間隔(${a.intervalDays}日)を過ぎています` : undefined;
    return { need, reason };
  }
  return { need: 0.1 * a.loss };
}

/** 防御の必要量の合計を 0〜1 に圧縮する */
export function pressureOf(needs: number[]): number {
  const total = needs.reduce((s, n) => s + n, 0);
  return 1 - Math.exp(-total / 3);
}

function energyFit(a: Action, mood: Mood, busy: WeekPlan["busy"] | undefined): number {
  const table: Record<Mood, [number, number, number]> = {
    tired: [1.6, 0.6, 0.15],
    normal: [1, 1, 0.8],
    hyper: [0.7, 1, 1.6],
  };
  let f = table[mood][a.energy - 1];
  if (busy === "busy" && a.energy === 3) f *= 0.5;
  if (busy === "free" && a.energy === 3) f *= 1.3;
  return f;
}

/** 疲労: 直近3時間でこなした数から気分を一段階下げる */
export function effectiveMood(mood: Mood, draws: Draw[], now: Date): Mood {
  const recent = draws.filter(
    (d) => d.outcome === "done" && now.getTime() - (d.resolvedAt ?? d.at) < 3 * HOUR,
  ).length;
  if (recent < 3) return mood;
  return mood === "hyper" ? "normal" : "tired";
}

function thisWeek(draws: Draw[], now: Date): Draw[] {
  const start = parseYmd(weekStartOf(now)).getTime();
  return draws.filter((d) => d.at >= start);
}

/**
 * 週単位の偏り補正: 今週完了した攻撃行動のうち、各目標が占める割合を
 * 月の配分(goalWeights)と比べ、足りない目標を引きやすくする。
 */
export function goalBoosts(
  actions: Action[],
  draws: Draw[],
  month: MonthPlan | undefined,
  now: Date,
): Record<string, number> {
  const weights = month?.goalWeights ?? {};
  const goalIds = Object.keys(weights).filter((g) => weights[g] > 0);
  const totalW = goalIds.reduce((s, g) => s + weights[g], 0);
  const byId = new Map(actions.map((a) => [a.id, a]));
  const counts: Record<string, number> = {};
  let n = 0;
  for (const d of thisWeek(draws, now)) {
    if (d.outcome !== "done") continue;
    const a = byId.get(d.actionId);
    if (!a || a.kind !== "offense" || !a.goalId) continue;
    counts[a.goalId] = (counts[a.goalId] ?? 0) + 1;
    n++;
  }
  const boosts: Record<string, number> = {};
  for (const g of goalIds) {
    const target = weights[g] / totalW;
    const actual = n === 0 ? 0 : (counts[g] ?? 0) / n;
    // 実績が少ないうちは補正を弱める
    const confidence = Math.min(1, n / 4);
    boosts[g] = clamp(1 + 2 * (target - actual) * confidence, 0.5, 2.5);
  }
  return boosts;
}

function rarityOf(score: number): Rarity {
  if (score >= 1.5) return "SSR";
  if (score >= 1.1) return "SR";
  if (score >= 0.7) return "R";
  return "N";
}

export function buildPlan(input: EngineInput): DrawPlan {
  const { actions, draws, month, week, now } = input;
  const mood = effectiveMood(input.mood, draws, now);
  const nowMs = now.getTime();
  const weekDraws = thisWeek(draws, now);
  const boosts = goalBoosts(actions, draws, month, now);

  const defense: Candidate[] = [];
  const offense: Candidate[] = [];
  const needs: number[] = [];

  for (const a of actions) {
    if (a.archived) continue;
    const priority = week?.priorities[a.id] ?? "normal";
    if (priority === "off") continue;

    const reasons: string[] = [];
    let base: number;
    let score: number;

    if (a.kind === "defense") {
      const { need, reason } = defenseNeed(a, draws, now);
      needs.push(need);
      if (reason) reasons.push(reason);
      base = 0.2 + need;
      score = need;
    } else {
      const gw = a.goalId ? (month?.goalWeights[a.goalId] ?? 1) : 1;
      if (gw <= 0) continue;
      const boost = a.goalId ? (boosts[a.goalId] ?? 1) : 1;
      if (boost >= 1.4) reasons.push("今週まだ進んでいない目標");
      base = gw * boost;
      score = boost * (gw >= 2 ? 1.1 : 1);
    }

    let w = base;
    if (priority === "high") {
      w *= 3;
      score *= 1.4;
      reasons.push("今週の優先");
    }
    w *= energyFit(a, mood, week?.busy);

    // 直近に引いたもの・拒否が続いたものは出にくく(ただし必要な防御は完全には消さない)
    const recentlyDrawn = draws.some((d) => d.actionId === a.id && nowMs - d.at < 2 * HOUR);
    if (recentlyDrawn) w *= 0.15;
    const skips = weekDraws.filter((d) => d.actionId === a.id && d.outcome === "skipped").length;
    const skipFactor = Math.pow(0.7, skips);
    w *= a.kind === "defense" && score >= 1 ? Math.max(0.4, skipFactor) : skipFactor;
    if (a.kind === "offense") {
      const last = lastDoneAt(a.id, draws);
      if (last !== undefined && nowMs - last < 12 * HOUR) w *= 0.6;
    }

    const c: Candidate = { action: a, weight: w, rarity: rarityOf(score), reasons };
    (a.kind === "defense" ? defense : offense).push(c);
  }

  const pressure = pressureOf(needs);
  const share = month?.offenseShare ?? 0.8;
  // 防御は必要量を先に確保し、残りの余力を攻撃に配分する
  let pDefense = pressure + (1 - pressure) * (1 - share);

  // 今週の防御/攻撃の偏りを補正
  const resolved = weekDraws.filter((d) => d.outcome === "done");
  if (resolved.length >= 3) {
    const kindOf = new Map(actions.map((a) => [a.id, a.kind]));
    const defDone = resolved.filter((d) => kindOf.get(d.actionId) === "defense").length;
    pDefense += 0.5 * (pDefense - defDone / resolved.length);
  }
  pDefense = clamp(pDefense, 0.05, 0.95);
  if (defense.length === 0) pDefense = 0;
  if (offense.length === 0 && defense.length > 0) pDefense = 1;

  return { pDefense, defensePressure: pressure, defense, offense };
}

function pickWeighted<T extends { weight: number }>(items: T[], rng: () => number): T | undefined {
  const total = items.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (const c of items) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return items[items.length - 1];
}

export function draw(input: EngineInput, rng: () => number = Math.random): Candidate | undefined {
  const plan = buildPlan(input);
  const pool = rng() < plan.pDefense ? plan.defense : plan.offense;
  return pickWeighted(pool.length ? pool : [...plan.defense, ...plan.offense], rng);
}
