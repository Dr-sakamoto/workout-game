import type { Exercise, StatKey } from "./types";

// 種目マスタ。DESIGN.md §2.1/§2.2 のステータスマッピングと係数設計に対応。
// コンパウンド・高負荷種目ほど coefficient を高くし「ちゃんと追い込む」ことを報酬で誘導する。
export const EXERCISES: Exercise[] = [
  // 胸 (STR)
  { id: "bench", name: "ベンチプレス", category: "chest", targetStat: "str", coefficient: 1.3, bodyweight: false, emoji: "🛏️" },
  { id: "pushup", name: "腕立て伏せ", category: "chest", targetStat: "str", coefficient: 0.9, bodyweight: true, bodyweightFactor: 0.65, emoji: "🤸" },
  { id: "dumbbell_press", name: "ダンベルプレス", category: "chest", targetStat: "str", coefficient: 1.1, bodyweight: false, emoji: "💪" },

  // 背中 (AGI / 引く力)
  { id: "deadlift", name: "デッドリフト", category: "back", targetStat: "vit", coefficient: 1.5, bodyweight: false, emoji: "🏋️" },
  { id: "pullup", name: "懸垂", category: "back", targetStat: "agi", coefficient: 1.2, bodyweight: true, bodyweightFactor: 1.0, emoji: "🧗" },
  { id: "row", name: "ベントオーバーロウ", category: "back", targetStat: "str", coefficient: 1.1, bodyweight: false, emoji: "🚣" },

  // 脚 (VIT)
  { id: "squat", name: "スクワット", category: "legs", targetStat: "vit", coefficient: 1.4, bodyweight: false, emoji: "🦵" },
  { id: "bw_squat", name: "自重スクワット", category: "legs", targetStat: "vit", coefficient: 0.8, bodyweight: true, bodyweightFactor: 0.6, emoji: "🪑" },
  { id: "lunge", name: "ランジ", category: "legs", targetStat: "vit", coefficient: 0.9, bodyweight: true, bodyweightFactor: 0.7, emoji: "🚶" },

  // 肩 (STR)
  { id: "ohp", name: "オーバーヘッドプレス", category: "shoulders", targetStat: "str", coefficient: 1.2, bodyweight: false, emoji: "🙆" },
  { id: "lateral", name: "サイドレイズ", category: "shoulders", targetStat: "dex", coefficient: 0.8, bodyweight: false, emoji: "🦅" },

  // 腕 (DEX)
  { id: "curl", name: "アームカール", category: "arms", targetStat: "dex", coefficient: 0.8, bodyweight: false, emoji: "💪" },
  { id: "dips", name: "ディップス", category: "arms", targetStat: "str", coefficient: 1.0, bodyweight: true, bodyweightFactor: 0.85, emoji: "🤾" },

  // 体幹 (VIT)
  { id: "plank", name: "プランク(分)", category: "core", targetStat: "vit", coefficient: 1.0, bodyweight: true, bodyweightFactor: 0.5, emoji: "🧘" },
  { id: "situp", name: "腹筋", category: "core", targetStat: "vit", coefficient: 0.7, bodyweight: true, bodyweightFactor: 0.4, emoji: "🔥" },

  // 有酸素 (END) — METs ベース
  { id: "run", name: "ランニング", category: "cardio", targetStat: "end", coefficient: 1.0, bodyweight: true, mets: 8.0, emoji: "🏃" },
  { id: "cycling", name: "サイクリング", category: "cardio", targetStat: "end", coefficient: 1.0, bodyweight: true, mets: 6.0, emoji: "🚴" },
  { id: "hiit", name: "HIIT", category: "cardio", targetStat: "agi", coefficient: 1.0, bodyweight: true, mets: 10.0, emoji: "⚡" },
  { id: "walk", name: "ウォーキング", category: "cardio", targetStat: "end", coefficient: 1.0, bodyweight: true, mets: 3.5, emoji: "🚶" },
];

export const EXERCISE_MAP: Record<string, Exercise> = Object.fromEntries(
  EXERCISES.map((e) => [e.id, e]),
);

export const STAT_LABELS: Record<StatKey, { label: string; full: string; emoji: string }> = {
  str: { label: "STR", full: "筋力", emoji: "💪" },
  end: { label: "END", full: "持久力", emoji: "🫀" },
  vit: { label: "VIT", full: "体力", emoji: "🛡️" },
  agi: { label: "AGI", full: "俊敏", emoji: "💨" },
  dex: { label: "DEX", full: "技巧", emoji: "🎯" },
};

export const CATEGORY_LABELS: Record<string, string> = {
  chest: "胸",
  back: "背中",
  legs: "脚",
  shoulders: "肩",
  arms: "腕",
  core: "体幹",
  cardio: "有酸素",
};
