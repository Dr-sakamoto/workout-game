import type { Action, DailyCard, Draw, Energy } from "./types";

/** 行動を1つ終えるごとに入る基本のXP(体力コスト1 / 2 / 3) */
export const XP_BY_ENERGY: Record<Energy, number> = { 1: 3, 2: 7, 3: 15 };
/** 過酷(体力コスト3)な行動の基本XP */
export const XP_PER_HARD = XP_BY_ENERGY[3];

export const baseXp = (energy: Energy | undefined): number => XP_BY_ENERGY[energy ?? 1];

/**
 * 行動を完了したときのXPを決める。基本は体力コストで固定で、たまにボーナス(×2 / まれに×3)。
 * 完了の時点で決めて保存し、見せるのは上納のときだけ
 */
export function rollXp(energy: Energy, rng: () => number = Math.random): number {
  const r = rng();
  const base = baseXp(energy);
  if (r < 0.05) return base * 3;
  if (r < 0.2) return base * 2;
  return base;
}

/** レベルnに必要な累計XP。1→2は20、2→3は60…と少しずつ遠くなる */
export const xpForLevel = (level: number) => 20 * (level - 1) ** 2;

export function levelOf(xp: number): number {
  let lv = 1;
  while (xp >= xpForLevel(lv + 1)) lv++;
  return lv;
}

/** 1枚のステッカーのXP。保存された値を使い、ない古い記録は今の体力コストから基本値で数える */
function xpOf(d: Draw, actions: Action[]): number {
  if (d.outcome !== "done") return 0;
  if (d.xp !== undefined) return d.xp;
  const a = actions.find((x) => x.id === d.actionId);
  return a ? baseXp(a.energy) : 0;
}

function doneDraws(cards: DailyCard[], draws: Draw[]): Draw[] {
  const ids = new Set(cards.flatMap((c) => c.drawIds));
  return draws.filter((d) => ids.has(d.id) && d.outcome === "done");
}

const sumXp = (cards: DailyCard[], draws: Draw[], actions: Action[]) =>
  doneDraws(cards, draws).reduce((s, d) => s + xpOf(d, actions), 0);

/** 上納済みのカードから数えた累計XP。上納の演出以外では表示しない */
export function totalXp(cards: DailyCard[], draws: Draw[], actions: Action[]): number {
  return sumXp(cards.filter((c) => c.tributed), draws, actions);
}

/** これから上納するカードで増えるXP */
export function gainedXp(stale: DailyCard[], draws: Draw[], actions: Action[]): number {
  return sumXp(stale, draws, actions);
}

/** これから上納するカードで出たボーナスの最大倍率(なければ1) */
export function bonusOf(stale: DailyCard[], draws: Draw[], actions: Action[]): number {
  return Math.max(
    1,
    ...doneDraws(stale, draws).map((d) => {
      const a = actions.find((x) => x.id === d.actionId);
      return a ? (d.xp ?? 0) / baseXp(a.energy) : 1;
    }),
  );
}
