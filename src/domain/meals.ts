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

  // タンパク質スコア(達成率100%で満点80、超過は頭打ち)
  const proteinScore = Math.min(1, proteinPct) * 80;

  // カロリーの収まり具合(目標±15%以内なら満点20)
  const cGoal = calorieGoal(profile);
  const calRatio = cGoal > 0 ? Math.abs(totals.calories - cGoal) / cGoal : 1;
  const calorieScore = Math.max(0, 1 - calRatio / 0.5) * 20;

  // まだ何も食べていない日は中立(ペナルティを与えない)
  const hasData = meals.length > 0;
  const score = hasData ? Math.round(proteinScore + calorieScore) : 50;

  // EXP補正: スコア 0→-10%, 50→±0%, 100→+15%
  const expModifier = hasData ? 1 + (score - 50) / 100 * (score >= 50 ? 0.3 : 0.2) : 1;

  let label = "ふつう";
  let emoji = "😐";
  if (!hasData) {
    label = "未記録";
    emoji = "🍽️";
  } else if (score >= 80) {
    label = "絶好調";
    emoji = "🔥";
  } else if (score >= 60) {
    label = "好調";
    emoji = "😎";
  } else if (score < 35) {
    label = "栄養不足";
    emoji = "😪";
  }

  return {
    score,
    expModifier: Math.round(expModifier * 100) / 100,
    label,
    emoji,
    proteinPct,
  };
}
