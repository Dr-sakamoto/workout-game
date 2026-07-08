import type { WorkoutLog, MealLog, Profile } from "./types";
import { sumMeals } from "./meals";

// DESIGN.md §4 デイリークエスト。今日のログから進捗を純粋に評価する。

export interface Quest {
  id: string;
  title: string;
  emoji: string;
  progress: number;
  target: number;
  done: boolean;
  rewardExp: number;
  rewardGold: number;
}

/**
 * クエスト用のタンパク質目標(g)。初心者ほど達成しやすいよう段階制にする。
 * いきなり体重×1.6gは「かんたん記録3食≒90g」の実態に対し常時未達になり、
 * 毎日並ぶ未達クエストが学習性無力感を生む(UX_AUDIT B)。そこでレベルを
 * 「続けてきた度合い」の代理指標として、×1.2 → ×1.4 → ×1.6 と伸ばす。
 * ※コンディション補正(meals.computeCondition)側は満点基準×1.6のまま。
 *   あちらは未達でも減点しない純ボーナスなので、ハードルにはならない。
 */
export function questProteinGoal(weightKg: number, level: number): number {
  const mult = level >= 10 ? 1.6 : level >= 5 ? 1.4 : 1.2;
  return Math.round(weightKg * mult);
}

export function evaluateDailyQuests(
  todaysWorkouts: WorkoutLog[],
  todaysMeals: MealLog[],
  profile: Profile,
  level = 1,
): Quest[] {
  const pGoal = questProteinGoal(profile.weightKg, level);
  const protein = sumMeals(todaysMeals).protein;

  // 北極星指標は「週3回以上"記録する"習慣ユーザー数」(DESIGN.md §9)。
  // だから毎日必ず達成できる"記録するだけ"の低ハードル枠を2つ(トレ1回・
  // 食事1回)常設し、成功体験を毎日必ず得られるようにする。3つ目だけを
  // 段階制の成長目標(タンパク質)にして、伸びしろを示す。
  const quests: Quest[] = [
    {
      id: "train_today",
      title: "今日のトレーニングを記録する",
      emoji: "🏋️",
      progress: Math.min(1, todaysWorkouts.length),
      target: 1,
      done: todaysWorkouts.length >= 1,
      rewardExp: 30,
      rewardGold: 10,
    },
    {
      id: "log_meal",
      title: "食事を1回記録する",
      emoji: "🍽️",
      progress: Math.min(1, todaysMeals.length),
      target: 1,
      done: todaysMeals.length >= 1,
      rewardExp: 20,
      rewardGold: 8,
    },
    {
      id: "protein_goal",
      title: `タンパク質 ${pGoal}g を摂る`,
      emoji: "🍗",
      progress: Math.min(pGoal, Math.round(protein)),
      target: pGoal,
      done: protein >= pGoal,
      rewardExp: 40,
      rewardGold: 12,
    },
  ];

  return quests;
}
