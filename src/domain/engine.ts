import type { Action, Ban, DailyCard, Draw, Mood, MonthPlan, WeekPlan } from "./types";
import { HOUR, daysBetween, daysUntil, weekStartOf, parseYmd, ymd } from "./dates";

export interface EngineInput {
  actions: Action[];
  draws: Draw[];
  cards?: DailyCard[];
  month?: MonthPlan;
  week?: WeekPlan;
  now: Date;
}

export interface Candidate {
  action: Action;
  weight: number;
}

export interface DrawPlan {
  /** 防御行動を引く確率 */
  pDefense: number;
  /** 防御の必要量(0〜1)。期限・損失・間隔から算出 */
  defensePressure: number;
  defense: Candidate[];
  offense: Candidate[];
}

/** 1枚のカードに載るステッカーの数 */
export const STICKERS_PER_CARD = 4;

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
export function defenseNeed(a: Action, draws: Draw[], now: Date): number {
  const lossFactor = a.loss / 2;
  if (a.deadline) {
    const d = daysUntil(a.deadline, now);
    if (d < 0) return 1.5 * lossFactor;
    return (1 / (1 + d / 3)) * lossFactor;
  }
  if (a.intervalDays) {
    // 未実施なら「間隔の3/4が経過済み」とみなし、初日から防御で埋まらないようにする
    const last = lastDoneAt(a.id, draws) ?? a.createdAt - a.intervalDays * 0.75 * 24 * HOUR;
    const ratio = daysBetween(last, now.getTime()) / a.intervalDays;
    return clamp(ratio - 0.5, 0, 1.5) * lossFactor;
  }
  return 0.1 * a.loss;
}

/** 防御の必要量の合計を 0〜1 に圧縮する */
export function pressureOf(needs: number[]): number {
  const total = needs.reduce((s, n) => s + n, 0);
  return 1 - Math.exp(-total / 3);
}

/**
 * 疲労の推定: 直近に上納したカードの消化具合で調子を決める。
 * ほとんどできなかった翌日は軽い行動、全部できた翌日は重めの行動が出やすい。
 */
export function inferMood(cards: DailyCard[], draws: Draw[]): Mood {
  const last = [...cards].filter((c) => c.tributed).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last || last.drawIds.length === 0) return "normal";
  const done = draws.filter((d) => last.drawIds.includes(d.id) && d.outcome === "done").length;
  if (done <= 1) return "tired";
  if (done >= last.drawIds.length) return "hyper";
  return "normal";
}

function energyFit(a: Action, mood: Mood, busy: WeekPlan["busy"] | undefined): number {
  const table: Record<Mood, [number, number, number]> = {
    tired: [1.6, 0.8, 0.3],
    normal: [1, 1, 0.8],
    hyper: [0.8, 1, 1.5],
  };
  let f = table[mood][a.energy - 1];
  if (busy === "busy" && a.energy === 3) f *= 0.5;
  if (busy === "free" && a.energy === 3) f *= 1.3;
  return f;
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

export function buildPlan(input: EngineInput): DrawPlan {
  const { actions, draws, month, week, now } = input;
  const mood = inferMood(input.cards ?? [], draws);
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

    let w: number;
    let urgent = false;
    if (a.kind === "defense") {
      const need = defenseNeed(a, draws, now);
      needs.push(need);
      urgent = need >= 1;
      w = 0.2 + need;
    } else {
      const gw = a.goalId ? (month?.goalWeights[a.goalId] ?? 1) : 1;
      if (gw <= 0) continue;
      w = gw * (a.goalId ? (boosts[a.goalId] ?? 1) : 1);
    }

    if (priority === "high") w *= 3;
    w *= energyFit(a, mood, week?.busy);

    // 前日のカードに載ったもの・やらずに上納が続いたものは出にくく(ただし急ぎの防御は残す)
    const recentlyDrawn = draws.some((d) => d.actionId === a.id && nowMs - d.at < 20 * HOUR);
    if (recentlyDrawn && !urgent) w *= 0.4;
    const skips = weekDraws.filter((d) => d.actionId === a.id && d.outcome === "skipped").length;
    w *= urgent ? Math.max(0.4, Math.pow(0.7, skips)) : Math.pow(0.7, skips);
    if (a.kind === "offense") {
      const last = lastDoneAt(a.id, draws);
      if (last !== undefined && nowMs - last < 12 * HOUR) w *= 0.6;
    }

    (a.kind === "defense" ? defense : offense).push({ action: a, weight: w });
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
  if (items.length === 0) return undefined;
  const total = items.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (const c of items) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return items[items.length - 1];
}

/** 今日のカードに載せる行動を重複なしで選ぶ */
export function drawStickers(
  input: EngineInput,
  count = STICKERS_PER_CARD,
  rng: () => number = Math.random,
): Action[] {
  const plan = buildPlan(input);
  let defense = plan.defense;
  let offense = plan.offense;
  const picked: Action[] = [];
  while (picked.length < count && defense.length + offense.length > 0) {
    const preferred = rng() < plan.pDefense ? defense : offense;
    const c = pickWeighted(preferred.length ? preferred : [...defense, ...offense], rng)!;
    picked.push(c.action);
    defense = defense.filter((x) => x !== c);
    offense = offense.filter((x) => x !== c);
  }
  return picked;
}

/**
 * 今日の禁止事項を選ぶ。最近破ったものほど出やすく、前日と同じものは出にくい。
 */
export function pickBan(
  bans: Ban[],
  cards: DailyCard[],
  now: Date,
  rng: () => number = Math.random,
): Ban | undefined {
  const active = bans.filter((b) => !b.archived);
  const since = new Date(now);
  since.setDate(since.getDate() - 14);
  const sinceKey = ymd(since);
  const recent = cards.filter((c) => c.date >= sinceKey);
  const last = [...cards].sort((a, b) => b.date.localeCompare(a.date))[0];
  const weighted = active.map((b) => {
    const broken = recent.filter((c) => c.banId === b.id && c.banBroken).length;
    let weight = 1 + 1.5 * broken;
    if (last?.banId === b.id) weight *= 0.3;
    return { ban: b, weight };
  });
  return pickWeighted(weighted, rng)?.ban;
}
