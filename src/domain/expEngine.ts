import type { Exercise, StatKey, WorkoutSet, Stats } from "./types";

// DESIGN.md §2.2 の経験値変換ロジックを実装。
// すべて純関数。サーバー側(チート防止)へそのまま移せるように副作用を持たせない。

const EXP_SCALE = 10; // ボリュームをEXPに落とすスケール

/** ウェイト/自重種目の素のEXP(コンディション補正前) */
export function computeStrengthExp(
  exercise: Exercise,
  sets: WorkoutSet[],
  userWeightKg: number,
): number {
  let volume = 0;
  for (const set of sets) {
    if (set.reps <= 0) continue;
    const load = exercise.bodyweight
      ? userWeightKg * (exercise.bodyweightFactor ?? 0.6) + Math.max(0, set.weight)
      : Math.max(0, set.weight);
    volume += load * set.reps;
  }
  return Math.round((volume * exercise.coefficient) / EXP_SCALE);
}

/** 有酸素種目の素のEXP。METs × 時間(分) × 体重係数 */
export function computeCardioExp(
  exercise: Exercise,
  minutes: number,
  userWeightKg: number,
): number {
  const mets = exercise.mets ?? 5;
  const weightFactor = userWeightKg / 70;
  return Math.round(mets * Math.max(0, minutes) * weightFactor * exercise.coefficient);
}

/** 種目の素のEXPを、入力内容に応じて自動で算出 */
export function computeBaseExp(
  exercise: Exercise,
  input: { sets?: WorkoutSet[]; minutes?: number },
  userWeightKg: number,
): number {
  if (exercise.category === "cardio") {
    return computeCardioExp(exercise, input.minutes ?? 0, userWeightKg);
  }
  return computeStrengthExp(exercise, input.sets ?? [], userWeightKg);
}

/** EXP からゴールド(報酬通貨)を算出 */
export function computeGold(earnedExp: number): number {
  return Math.max(1, Math.round(earnedExp / 5));
}

/** 獲得EXPの一部を対象ステータスへ振り分ける */
export function computeStatGains(exercise: Exercise, earnedExp: number): Partial<Stats> {
  const main = Math.max(1, Math.round(earnedExp * 0.12));
  const vitSpill = Math.round(earnedExp * 0.04); // 総量はVITにも少し乗る
  const gains: Partial<Stats> = {};
  gains[exercise.targetStat] = (gains[exercise.targetStat] ?? 0) + main;
  if (exercise.targetStat !== "vit" && vitSpill > 0) {
    gains.vit = (gains.vit ?? 0) + vitSpill;
  }
  return gains;
}

export function addStats(base: Stats, gains: Partial<Stats>): Stats {
  const out: Stats = { ...base };
  (Object.keys(gains) as StatKey[]).forEach((k) => {
    out[k] = (out[k] ?? 0) + (gains[k] ?? 0);
  });
  return out;
}
