import type { WorkoutLog, MealLog, Profile } from "./types";
import { sumMeals, proteinGoal } from "./meals";

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

export function evaluateDailyQuests(
  todaysWorkouts: WorkoutLog[],
  todaysMeals: MealLog[],
  profile: Profile,
): Quest[] {
  const categories = new Set(todaysWorkouts.map((w) => w.category));
  const pGoal = proteinGoal(profile.weightKg);
  const protein = sumMeals(todaysMeals).protein;

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
      id: "two_parts",
      title: "2部位以上を鍛える",
      emoji: "🎯",
      progress: Math.min(2, categories.size),
      target: 2,
      done: categories.size >= 2,
      rewardExp: 50,
      rewardGold: 15,
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
