// フレームワーク非依存のドメイン型。後で React Native へ移植する際もここはそのまま使える。

export type StatKey = "str" | "end" | "vit" | "agi" | "dex";

export type Stats = Record<StatKey, number>;

export type ExerciseCategory =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "core"
  | "cardio";

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** この種目が主に伸ばすステータス */
  targetStat: StatKey;
  /** EXP 係数。危険・高負荷なコンパウンド種目ほど高い */
  coefficient: number;
  /** 自重種目か(true なら重量入力の代わりに体重×係数を使う) */
  bodyweight: boolean;
  /** 自重係数(体重の何割が負荷になるか) */
  bodyweightFactor?: number;
  /** 有酸素種目の METs 値 */
  mets?: number;
  emoji: string;
}

export interface WorkoutSet {
  weight: number; // kg(自重種目は 0 でよい。任意で加重ぶんを入れてもよい)
  reps: number;
}

export interface WorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  exerciseId: string;
  exerciseName: string;
  category: ExerciseCategory;
  sets: WorkoutSet[];
  minutes?: number; // 有酸素用
  baseExp: number;
  earnedExp: number; // コンディション補正後
  earnedGold: number;
  statGains: Partial<Stats>;
}

export type MealSlot = "morning" | "noon" | "night" | "snack";

export interface MealLog {
  id: string;
  date: string;
  name: string;
  protein: number; // g
  fat: number; // g
  carb: number; // g
  calories: number;
  slot?: MealSlot;
  /** かんたん記録などの概算値か(表示に「約」を付ける) */
  estimated?: boolean;
  /** バーコードスキャン由来の記録。修正時にコミュニティDBへ反映できる */
  barcode?: string;
}

export type SleepQuality = "good" | "normal" | "poor";

export interface SleepLog {
  date: string;
  quality: SleepQuality;
}

export type Goal = "bulk" | "cut" | "keep";

export interface Profile {
  name: string;
  heightCm: number;
  weightKg: number;
  goal: Goal;
}

export interface Avatar {
  level: number;
  totalExp: number;
  expIntoLevel: number;
  expForNextLevel: number;
  stats: Stats;
  gold: number;
}
