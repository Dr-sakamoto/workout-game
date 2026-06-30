import type { Stats } from "./types";

// 身長・体重(BMI)とステータスからアバターの体格を決める。
// 体の「横幅」は BMI(身長＋体重)、「筋肉の張り」は鍛錬(level / STR)で決まる。
// → ガリガリから始まり、鍛えるほどパンチクラブの主人公のように仕上がっていく。

export type BodyType = "slim" | "lean" | "average" | "stocky" | "heavy";

export interface Physique {
  bmi: number;
  bodyType: BodyType;
  bodyTypeLabel: string;
  /** 胴体・脚の横方向の太さ(セル数) */
  girth: number;
  /** 筋肉の発達段階 0..4(肩幅・腕の太さ・筋の陰影に影響) */
  muscle: number;
}

export function computeBmi(heightCm: number, weightKg: number): number {
  if (heightCm <= 0) return 0;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

function bodyTypeFromBmi(bmi: number): { type: BodyType; label: string; girth: number } {
  if (bmi < 18.5) return { type: "slim", label: "ガリガリ", girth: 0 };
  if (bmi < 23) return { type: "lean", label: "細マッチョ予備軍", girth: 1 };
  if (bmi < 27) return { type: "average", label: "標準体型", girth: 2 };
  if (bmi < 31) return { type: "stocky", label: "がっしり", girth: 3 };
  return { type: "heavy", label: "ヘビー級", girth: 4 };
}

/** BMI → 体の横幅(脂肪)段階 0..4 */
export function girthFromBmi(bmi: number): number {
  return bodyTypeFromBmi(bmi).girth;
}

/** BMI → 体型ラベル */
export function bodyTypeLabel(bmi: number): string {
  return bodyTypeFromBmi(bmi).label;
}

/** 筋肉発達段階。レベルと STR から算出(0..4) */
export function muscleTier(level: number, stats: Stats): number {
  const score = level * 0.7 + stats.str / 8;
  if (score >= 28) return 4;
  if (score >= 18) return 3;
  if (score >= 10) return 2;
  if (score >= 4) return 1;
  return 0;
}

export function computePhysique(
  heightCm: number,
  weightKg: number,
  level: number,
  stats: Stats,
): Physique {
  const bmi = computeBmi(heightCm, weightKg);
  const { type, label, girth } = bodyTypeFromBmi(bmi);
  return {
    bmi: Math.round(bmi * 10) / 10,
    bodyType: type,
    bodyTypeLabel: label,
    girth,
    muscle: muscleTier(level, stats),
  };
}
