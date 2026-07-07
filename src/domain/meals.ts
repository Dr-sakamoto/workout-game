import type { MealLog, Goal, Profile } from "./types";

// DESIGN.md §3 食事の統合。PFCをゲーム内の「コンディション(EXP補正)」へ変換する。

export interface PfcTotals {
  protein: number;
  fat: number;
  carb: number;
  calories: number;
}

export function sumMeals(meals: MealLog[]): PfcTotals {
  return meals.reduce<PfcTotals>(
    (acc, m) => ({
      protein: acc.protein + m.protein,
      fat: acc.fat + m.fat,
      carb: acc.carb + m.carb,
      calories: acc.calories + m.calories,
    }),
    { protein: 0, fat: 0, carb: 0, calories: 0 },
  );
}

/** 目標タンパク質(g) = 体重 × 1.6 */
export function proteinGoal(weightKg: number): number {
  return Math.round(weightKg * 1.6);
}

/** 目標カロリーの目安(増量/減量/維持で変動) */
export function calorieGoal(profile: Profile): number {
  const maintenance = Math.round(profile.weightKg * 33);
  const delta: Record<Goal, number> = { bulk: 300, cut: -400, keep: 0 };
  return maintenance + delta[profile.goal];
}

// --- 初心者向けの「ざっくり表現」 ---
// 初心者に必要なのは g 単位の精度ではなく「タンパク質は足りてる?」
// 「カロリーは摂りすぎ/足りない?」というざっくりした方向感(DESIGN.md ペルソナ)。
// 数値の代わりに言葉で状態を返す。正確な数値は詳細入力・編集画面に残す。

export interface RoughStatus {
  label: string;
  /** バーの色分け用: 足りている(good) / もう少し(mid) / 足りない(low) / 過剰(over) */
  tone: "good" | "mid" | "low" | "over";
}

/** タンパク質の充足度(達成率)を言葉にする */
export function proteinStatus(pct: number): RoughStatus {
  if (pct >= 1) return { label: "バッチリ！", tone: "good" };
  if (pct >= 0.6) return { label: "いい感じ", tone: "good" };
  if (pct >= 0.3) return { label: "あと少し", tone: "mid" };
  if (pct > 0) return { label: "もっと欲しい", tone: "low" };
  return { label: "これから", tone: "low" };
}

/** カロリーの摂れ具合(目標比)を言葉にする。目標は増量/減量/維持を織り込み済み */
export function calorieStatus(ratio: number): RoughStatus {
  if (ratio <= 0) return { label: "これから", tone: "low" };
  if (ratio < 0.6) return { label: "まだ食べてOK", tone: "low" };
  if (ratio <= 1.15) return { label: "いいペース", tone: "good" };
  return { label: "そろそろ十分", tone: "over" };
}

export interface Condition {
  /** 0..100 のコンディションスコア */
  score: number;
  /** ワークアウトEXPへの倍率補正(例: 1.12 = +12%) */
  expModifier: number;
  label: string;
  emoji: string;
  proteinPct: number; // 目標に対する達成率 0..1+
}

/**
 * その日の食事からコンディションを算出。
 * タンパク質の充足を主軸に、カロリーが目標から大きく外れると減点。
 */
export function computeCondition(meals: MealLog[], profile: Profile): Condition {
  const totals = sumMeals(meals);
  const pGoal = proteinGoal(profile.weightKg);
  const proteinPct = pGoal > 0 ? totals.protein / pGoal : 0;
  const hasData = meals.length > 0;

  // 初心者の習慣化が最優先(DESIGN.md)。だから食事の記録は「するほど得」にし、
  // 絶対にデバフにしない。正直に記録した朝食が『何も記録しない』より損になる
  // ような逆インセンティブを作らないための設計:
  //   - 1食でも記録した      → +3%(記録行動そのものへのご褒美)
  //   - タンパク質の達成度   → 最大 +12%(体重×1.6gで満点)。未達は「ボーナスが
  //                             小さいだけ」で、減点はしない
  // カロリーはEXP補正に使わない。1日の途中で目標に届いていないのは当然で、
  // それを減点にすると正直な記録が損になるため(表示のざっくりゲージのみで扱う)。
  const habitBonus = hasData ? 0.03 : 0;
  const proteinBonus = Math.min(1, Math.max(0, proteinPct)) * 0.12;
  const expModifier = 1 + habitBonus + proteinBonus; // 常に 1.0 以上(下限=±0%)

  // 内部指標としてのスコア(タンパク質達成度 0..100)。数値は前面に出さない。
  const score = Math.round(Math.min(1, Math.max(0, proteinPct)) * 100);

  let label = "未記録";
  let emoji = "🍽️";
  if (hasData) {
    if (proteinPct >= 1) {
      label = "絶好調";
      emoji = "🔥";
    } else if (proteinPct >= 0.6) {
      label = "好調";
      emoji = "😎";
    } else {
      // 記録できている時点で前向きに。栄養「不足」というネガティブ表現はしない
      label = "その調子";
      emoji = "🙂";
    }
  }

  return {
    score,
    expModifier: Math.round(expModifier * 100) / 100,
    label,
    emoji,
    proteinPct,
  };
}
