// 実績(トロフィー)。状態から導いた進捗で達成判定し、ゴールド報酬を受け取れる。
// 収集欲を満たす長期モチベーション。

export interface Progress {
  level: number;
  totalExp: number;
  bestStreak: number;
  totalWorkouts: number;
  bossesDefeated: number;
  muscle: number; // 見た目の発達段階 0..4
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  rewardGold: number;
  check: (p: Progress) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_workout", name: "はじめの一歩", desc: "初めてトレーニングを記録", emoji: "🐣", rewardGold: 10, check: (p) => p.totalWorkouts >= 1 },
  { id: "workouts_10", name: "継続の芽", desc: "トレを10回記録", emoji: "🌱", rewardGold: 20, check: (p) => p.totalWorkouts >= 10 },
  { id: "workouts_50", name: "鉄の意志", desc: "トレを50回記録", emoji: "🛡️", rewardGold: 60, check: (p) => p.totalWorkouts >= 50 },
  { id: "level_5", name: "見習い卒業", desc: "Lv.5 到達", emoji: "⭐", rewardGold: 20, check: (p) => p.level >= 5 },
  { id: "level_10", name: "一人前", desc: "Lv.10 到達", emoji: "🌟", rewardGold: 40, check: (p) => p.level >= 10 },
  { id: "level_25", name: "達人", desc: "Lv.25 到達", emoji: "💫", rewardGold: 100, check: (p) => p.level >= 25 },
  { id: "streak_7", name: "週間皆勤", desc: "7日連続記録", emoji: "🔥", rewardGold: 30, check: (p) => p.bestStreak >= 7 },
  { id: "streak_30", name: "習慣の鬼", desc: "30日連続記録", emoji: "🏆", rewardGold: 120, check: (p) => p.bestStreak >= 30 },
  { id: "boss_1", name: "初撃破", desc: "ボスを1体撃破", emoji: "⚔️", rewardGold: 25, check: (p) => p.bossesDefeated >= 1 },
  { id: "boss_5", name: "ボスハンター", desc: "ボスを5体撃破", emoji: "🗡️", rewardGold: 90, check: (p) => p.bossesDefeated >= 5 },
  { id: "muscle_2", name: "体が変わってきた", desc: "見た目が筋肉質に", emoji: "💪", rewardGold: 40, check: (p) => p.muscle >= 2 },
  { id: "muscle_4", name: "別人", desc: "見た目が最高段階に", emoji: "🦾", rewardGold: 150, check: (p) => p.muscle >= 4 },
];
