import type { YearGoal } from "../domain/types";
import { FREE, LIFE } from "../domain/shares";

export interface SliceStyle {
  fill: string;
  /** 円グラフの中に書く文字の色 */
  text: string;
}

const GOAL_COLORS: SliceStyle[] = [
  { fill: "#b3202a", text: "#ffffff" }, // 赤
  { fill: "#3f9e94", text: "#ffffff" }, // 青緑(ガラス)
  { fill: "#2b2b30", text: "#ffffff" }, // 墨
  { fill: "#7a62d9", text: "#ffffff" }, // 紫
  { fill: "#e08a3c", text: "#1a1a1a" }, // 橙
];

/** 円グラフ・行動リストで共通の色。くらし=メタル、そのほか=金、目標=順番に */
export function styleFor(key: string, goals: YearGoal[]): SliceStyle {
  if (key === LIFE) return { fill: "#a8b0bc", text: "#1a1a1a" };
  if (key === FREE) return { fill: "#d9b86a", text: "#1a1a1a" };
  const i = Math.max(0, goals.findIndex((g) => g.id === key));
  return GOAL_COLORS[i % GOAL_COLORS.length];
}

export function labelFor(key: string, goals: YearGoal[]): string {
  if (key === LIFE) return "くらし・用事";
  if (key === FREE) return "そのほか";
  return goals.find((g) => g.id === key)?.title ?? "(削除した目標)";
}
