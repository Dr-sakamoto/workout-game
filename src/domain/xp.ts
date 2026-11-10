import type { Action, DailyCard, Draw } from "./types";

/** 過酷(体力コスト3)な行動を1つ終えるごとに入るXP */
export const XP_PER_HARD = 10;

/** レベルnに必要な累計XP。1→2は20、2→3は60…と少しずつ遠くなる */
export const xpForLevel = (level: number) => 20 * (level - 1) ** 2;

export function levelOf(xp: number): number {
  let lv = 1;
  while (xp >= xpForLevel(lv + 1)) lv++;
  return lv;
}

/** カードに載った完了済みの過酷な行動の数 */
function hardDone(cards: DailyCard[], draws: Draw[], actions: Action[]): number {
  const ids = new Set(cards.flatMap((c) => c.drawIds));
  const hard = new Set(actions.filter((a) => a.energy === 3).map((a) => a.id));
  return draws.filter((d) => ids.has(d.id) && d.outcome === "done" && hard.has(d.actionId)).length;
}

/** 上納済みのカードから数えた累計XP。上納の演出以外では表示しない */
export function totalXp(cards: DailyCard[], draws: Draw[], actions: Action[]): number {
  return hardDone(cards.filter((c) => c.tributed), draws, actions) * XP_PER_HARD;
}

/** これから上納するカードで増えるXP */
export function gainedXp(stale: DailyCard[], draws: Draw[], actions: Action[]): number {
  return hardDone(stale, draws, actions) * XP_PER_HARD;
}
