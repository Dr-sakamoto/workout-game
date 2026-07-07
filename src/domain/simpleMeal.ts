// バーコードのない食事(自炊・外食)向けの「かんたん記録」。
//
// 初心者ペルソナ(DESIGN.md)にとって大事なのは g 単位の正確さではなく
// 「毎食記録する習慣」と「タンパク質・カロリーのざっくりした方向感」。
// コンディション計算(meals.ts)もタンパク質とカロリーしか実質見ていないので、
// タップ2回のざっくり推定で十分ゲームループが回る。
// 正確な値が欲しい人(上級者)には従来の g 単位入力を残す。

import type { PfcTotals } from "./meals";

/** タンパク質のおかず(肉・魚・卵・大豆・プロテイン)の量感 */
export type ProteinLevel = "solid" | "some" | "little" | "none";

/** 食事全体のボリューム感 */
export type MealSize = "big" | "normal" | "light";

export const PROTEIN_LEVELS: {
  id: ProteinLevel;
  label: string;
  emoji: string;
  /** 選択の目安として見せる説明 */
  hint: string;
  grams: number;
}[] = [
  { id: "solid", label: "しっかり", emoji: "🍗", hint: "手のひら1枚分以上／プロテイン1杯", grams: 30 },
  { id: "some", label: "そこそこ", emoji: "🍳", hint: "手のひら半分くらい", grams: 18 },
  { id: "little", label: "少なめ", emoji: "🥢", hint: "ちょっとだけ", grams: 8 },
  { id: "none", label: "ほぼなし", emoji: "🍙", hint: "麺・パン・菓子だけ等", grams: 2 },
];

export const MEAL_SIZES: {
  id: MealSize;
  label: string;
  emoji: string;
  hint: string;
  calories: number;
}[] = [
  { id: "big", label: "がっつり", emoji: "🍱", hint: "大盛り・おかわりした", calories: 850 },
  { id: "normal", label: "ふつう", emoji: "🍽️", hint: "定食1人前くらい", calories: 600 },
  { id: "light", label: "軽め", emoji: "🥪", hint: "小盛り・軽食・間食", calories: 300 },
];

/** 脂質が総カロリーに占める割合の仮定(日本の一般的な食事の中央値付近) */
const FAT_ENERGY_RATIO = 0.28;

/**
 * 量感2択からPFC・カロリーを推定する。
 * カロリーはサイズで決め、タンパク質は選択量、残りを脂質(28%)と炭水化物に配分。
 */
export function estimateSimpleMeal(protein: ProteinLevel, size: MealSize): PfcTotals {
  const p = PROTEIN_LEVELS.find((x) => x.id === protein)!.grams;
  const calories = MEAL_SIZES.find((x) => x.id === size)!.calories;
  const fat = Math.round((calories * FAT_ENERGY_RATIO) / 9);
  const carb = Math.max(0, Math.round((calories - p * 4 - fat * 9) / 4));
  return { protein: p, fat, carb, calories };
}

/** 名前を付けなかったときの自動ラベル(履歴チップからの再利用でも意味が通る) */
export function simpleMealName(protein: ProteinLevel, size: MealSize): string {
  const s = MEAL_SIZES.find((x) => x.id === size)!;
  const p = PROTEIN_LEVELS.find((x) => x.id === protein)!;
  return `${s.label}めし(タンパク質${p.label})`;
}
