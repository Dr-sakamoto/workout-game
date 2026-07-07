import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Avatar,
  MealLog,
  Profile,
  SleepLog,
  SleepQuality,
  Stats,
  WorkoutLog,
  WorkoutSet,
} from "../domain/types";
import { createAvatar, addExp, INITIAL_STATS, maxHp } from "../domain/avatar";
import { EXERCISE_MAP } from "../domain/exercises";
import {
  computeBaseExp,
  computeGold,
  computeStatGains,
  addStats,
} from "../domain/expEngine";
import { computeCondition } from "../domain/meals";
import { computeSleepCondition } from "../domain/sleep";
import { evaluateDailyQuests } from "../domain/quests";
import {
  emptyPartVolumes,
  categoryToPart,
  partTiers,
  type PartVolumes,
} from "../domain/parts";
import { overallMuscle } from "../domain/build";
import { girthFromBmi, computeBmi } from "../domain/physique";
import { bossAt } from "../domain/bosses";
import {
  effectiveSchedule,
  isScheduledDay,
  advanceScheduleStreak,
  missedScheduledDays,
} from "../domain/schedule";
import { SHOP_ITEMS, type ItemEffect } from "../domain/shop";
import { ACHIEVEMENTS, type Progress } from "../domain/achievements";

export function todayKey(d = new Date()): string {
  // ローカル時刻基準の YYYY-MM-DD。
  // toISOString() は UTC なので、JST等では日付の境目がズレる(深夜0時でなく朝9時)。
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface PenaltyInfo {
  missedDays: number;
  damagePerDay: number;
  totalDamage: number;
  bossName: string;
  bossEmoji: string;
  newHp: number;
  maxHp: number;
}

export interface FloatingReward {
  exp: number;
  gold: number;
  levelsGained: number;
  statText: string;
  modifier: number;
  newBest?: string;
  bossDefeated?: string;
  expBoostUsed?: boolean;
  source?: "workout" | "quest" | "achievement";
}

/** キャラメイク時の体格スナップショット(Before表示用 — 原則2) */
export interface StartSnapshot {
  heightCm: number;
  weightKg: number;
  level: number;
  stats: Stats;
  date: string;
}

/** 自己ベスト(ライバルは自分 — 原則3。他人との比較は持たない) */
export interface Records {
  bestVolumeByExercise: Record<string, number>;
  bestDayExp: number;
  bestStreak: number;
}

export interface BossState {
  index: number;
  hp: number;
}

/** その種目1回ぶんのボリューム(自重は体重を負荷に含める) */
function workoutVolume(
  sets: WorkoutSet[],
  bodyweight: boolean,
  bwFactor: number,
  userWeightKg: number,
): number {
  return sets.reduce((acc, s) => {
    if (s.reps <= 0) return acc;
    const load = bodyweight
      ? userWeightKg * bwFactor + Math.max(0, s.weight)
      : Math.max(0, s.weight);
    return acc + load * s.reps;
  }, 0);
}

interface GameState {
  profile: Profile | null;
  avatar: Avatar;
  workoutLogs: WorkoutLog[];
  mealLogs: MealLog[];
  sleepLogs: SleepLog[];
  streak: { count: number; lastDate: string | null };
  claimedQuestsByDate: Record<string, string[]>;
  lastReward: FloatingReward | null;
  startSnapshot: StartSnapshot | null;
  records: Records;
  boss: BossState;
  bossesDefeated: number;
  claimedAchievements: string[];
  expBoostCharges: number;
  streakShields: number;
  partVolumes: PartVolumes;
  bodyFat: number | null; // 全身の体脂肪 0..4。null=BMIから自動
  lastSetsByExercise: Record<string, WorkoutSet[]>; // 前回値プリフィル用
  lastMinutesByExercise: Record<string, number>;
  favorites: string[]; // お気に入り種目ID
  playerHp: number; // 現在HP。サボると減り、トレで回復する
  lastDailyCheckDate: string | null; // 日次ペナルティ処理済みの日付
  lastPenalty: PenaltyInfo | null; // 表示用ペナルティ情報

  initProfile: (p: Profile) => void;
  setBodyFat: (n: number) => void;
  changeSchedule: (days: number[]) => void;
  toggleFavorite: (exerciseId: string) => void;
  logWorkout: (exerciseId: string, input: { sets?: WorkoutSet[]; minutes?: number }) => void;
  logMeal: (meal: Omit<MealLog, "id" | "date">) => void;
  updateMeal: (id: string, patch: Partial<Omit<MealLog, "id" | "date">>) => void;
  deleteMeal: (id: string) => void;
  logSleep: (quality: SleepQuality) => void;
  claimQuest: (questId: string, rewardExp: number, rewardGold: number) => void;
  claimAchievement: (id: string, rewardGold: number) => void;
  buyItem: (id: ItemEffect) => void;
  clearReward: () => void;
  clearPenalty: () => void;
  applyDailyPenalty: () => void;
  resetAll: () => void;
}

const FRESH = {
  avatar: createAvatar(),
  workoutLogs: [] as WorkoutLog[],
  mealLogs: [] as MealLog[],
  sleepLogs: [] as SleepLog[],
  streak: { count: 0, lastDate: null as string | null },
  claimedQuestsByDate: {} as Record<string, string[]>,
  lastReward: null as FloatingReward | null,
  startSnapshot: null as StartSnapshot | null,
  records: { bestVolumeByExercise: {}, bestDayExp: 0, bestStreak: 0 } as Records,
  boss: { index: 0, hp: bossAt(0).maxHp } as BossState,
  bossesDefeated: 0,
  claimedAchievements: [] as string[],
  expBoostCharges: 0,
  streakShields: 0,
  partVolumes: emptyPartVolumes(),
  bodyFat: null as number | null,
  lastSetsByExercise: {} as Record<string, WorkoutSet[]>,
  lastMinutesByExercise: {} as Record<string, number>,
  favorites: [] as string[],
  playerHp: maxHp(INITIAL_STATS), // 60
  lastDailyCheckDate: null as string | null,
  lastPenalty: null as PenaltyInfo | null,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      profile: null,
      ...FRESH,

      initProfile: (p) =>
        set({
          profile: p,
          // 体脂肪の初期値は BMI から(以後ユーザーが調整可能)
          bodyFat: girthFromBmi(computeBmi(p.heightCm, p.weightKg)),
          // 「最初の自分」を保存。以後ずっと Before として残る(原則2)
          startSnapshot: {
            heightCm: p.heightCm,
            weightKg: p.weightKg,
            level: 1,
            stats: { ...INITIAL_STATS },
            date: todayKey(),
          },
        }),

      setBodyFat: (n) => set({ bodyFat: Math.max(0, Math.min(4, n)) }),

      // トレーニングスケジュールの変更。SNSのユーザーネーム的に「基本は据え置き」
      // の想定(将来、変更に課金/頻度制限を付ける)。空配列は受け付けない。
      changeSchedule: (days) =>
        set((s) =>
          !s.profile || days.length === 0
            ? {}
            : { profile: { ...s.profile, trainingDays: [...days].sort((a, b) => a - b) } },
        ),

      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((x) => x !== id)
            : [...s.favorites, id],
        })),

      logWorkout: (exerciseId, input) => {
        const state = get();
        const profile = state.profile;
        const exercise = EXERCISE_MAP[exerciseId];
        if (!profile || !exercise) return;

        const today = todayKey();
        const todaysMeals = state.mealLogs.filter((m) => m.date === today);
        const condition = computeCondition(todaysMeals, profile);
        const todaySleep = state.sleepLogs.find((s) => s.date === today) ?? null;
        const sleepCond = computeSleepCondition(todaySleep?.quality ?? null);

        const baseExp = computeBaseExp(exercise, input, profile.weightKg);
        if (baseExp <= 0) return;

        // コンディション補正(食事×睡眠)
        let earnedExp = Math.max(1, Math.round(baseExp * condition.expModifier * sleepCond.expModifier));
        // コンディションドリンク(EXPブースト)を1チャージ消費
        let expBoostCharges = state.expBoostCharges;
        let expBoostUsed = false;
        if (expBoostCharges > 0) {
          earnedExp = Math.round(earnedExp * 1.5);
          expBoostCharges -= 1;
          expBoostUsed = true;
        }
        const earnedGold = computeGold(earnedExp);
        const statGains = computeStatGains(exercise, earnedExp);

        const log: WorkoutLog = {
          id: crypto.randomUUID(),
          date: today,
          exerciseId,
          exerciseName: exercise.name,
          category: exercise.category,
          sets: input.sets ?? [],
          minutes: input.minutes,
          baseExp,
          earnedExp,
          earnedGold,
          statGains,
        };

        // --- ボス戦: 獲得EXPがダメージ ---
        let bossIndex = state.boss.index;
        let bossHp = state.boss.hp - earnedExp;
        let bossDefeated: string | undefined;
        let bossGold = 0;
        let bossExp = 0;
        let bossesDefeated = state.bossesDefeated;
        if (bossHp <= 0) {
          const b = bossAt(bossIndex);
          bossDefeated = b.name;
          bossGold = b.rewardGold;
          bossExp = b.rewardExp;
          bossesDefeated += 1;
          bossIndex += 1;
          bossHp = bossAt(bossIndex).maxHp; // 次のボスは満タンから(オーバーキル持ち越しなし)
        }

        // --- レベル/ゴールド(ワークアウト＋ボス報酬) ---
        const { avatar: leveled, levelsGained } = addExp(state.avatar, earnedExp + bossExp);
        const avatar: Avatar = {
          ...leveled,
          stats: addStats(leveled.stats, statGains),
          gold: leveled.gold + earnedGold + bossGold,
        };

        const statText = Object.entries(statGains)
          .map(([k, v]) => `${k.toUpperCase()} +${v}`)
          .join("  ");

        // --- ストリーク(スケジュール基準) ---
        // 予定日(本人の週間スケジュール)にトレした時だけ継続を伸ばす。予定日を
        // 飛ばすと途切れる。予定外の日(休養日)のトレはストリークに影響しない。
        const sched = effectiveSchedule(profile.trainingDays);
        let streakRes = state.streak;
        let shieldUsed = false;
        if (isScheduledDay(today, sched)) {
          const advanced = advanceScheduleStreak(state.streak, today, sched);
          // 予定日を飛ばして継続が切れた場合、シールド在庫があれば1回守る
          // (Phase2でキャラ絡みの"課金で見逃し"イベントに置き換え予定)
          const brokeChain =
            state.streak.lastDate !== null &&
            state.streak.lastDate !== today &&
            advanced.count === 1 &&
            state.streak.count > 0;
          if (brokeChain && state.streakShields > 0) {
            streakRes = { count: state.streak.count + 1, lastDate: today };
            shieldUsed = true;
          } else {
            streakRes = advanced;
          }
        }
        const streakShields = state.streakShields - (shieldUsed ? 1 : 0);

        // --- 自己ベスト判定(ライバルは自分) ---
        const records = state.records;
        let newBest: string | undefined;
        const volume = workoutVolume(
          input.sets ?? [],
          exercise.bodyweight,
          exercise.bodyweightFactor ?? 0.6,
          profile.weightKg,
        );
        // --- 部位別ボリュームの累積(部位ごとに見た目が育つ) ---
        const partKey = categoryToPart(exercise.category);
        const partGain = exercise.category === "cardio" ? earnedExp * 4 : volume;
        const partVolumes: PartVolumes = {
          ...state.partVolumes,
          [partKey]: state.partVolumes[partKey] + partGain,
        };

        const prevVolBest = records.bestVolumeByExercise[exerciseId] ?? 0;
        const todayExp =
          earnedExp +
          state.workoutLogs
            .filter((w) => w.date === today)
            .reduce((a, w) => a + w.earnedExp, 0);

        const nextRecords: Records = {
          bestVolumeByExercise: { ...records.bestVolumeByExercise },
          bestDayExp: Math.max(records.bestDayExp, todayExp),
          bestStreak: Math.max(records.bestStreak, streakRes.count),
        };
        if (volume > prevVolBest && prevVolBest > 0) {
          newBest = `${exercise.name} 自己ベスト更新！`;
          nextRecords.bestVolumeByExercise[exerciseId] = volume;
        } else {
          nextRecords.bestVolumeByExercise[exerciseId] = Math.max(prevVolBest, volume);
          if (todayExp > records.bestDayExp && records.bestDayExp > 0) {
            newBest = "1日の最高EXPを更新！";
          } else if (streakRes.count > records.bestStreak && records.bestStreak > 0) {
            newBest = `最長ストリーク更新！ ${streakRes.count}回`;
          }
        }

        // --- HPの回復: トレーニングするとHPが戻る ---
        const newMaxHp = maxHp(avatar.stats);
        const hpRecovery = Math.floor(earnedExp / 4);
        const playerHp = Math.min(newMaxHp, (state.playerHp ?? newMaxHp) + hpRecovery);

        set({
          avatar,
          workoutLogs: [log, ...state.workoutLogs],
          streak: { count: streakRes.count, lastDate: streakRes.lastDate },
          streakShields,
          expBoostCharges,
          records: nextRecords,
          partVolumes,
          playerHp,
          lastSetsByExercise: input.sets
            ? { ...state.lastSetsByExercise, [exerciseId]: input.sets }
            : state.lastSetsByExercise,
          lastMinutesByExercise: input.minutes
            ? { ...state.lastMinutesByExercise, [exerciseId]: input.minutes }
            : state.lastMinutesByExercise,
          boss: { index: bossIndex, hp: bossHp },
          bossesDefeated,
          lastReward: {
            exp: earnedExp,
            gold: earnedGold + bossGold,
            levelsGained,
            statText,
            modifier: Math.round(condition.expModifier * sleepCond.expModifier * 100) / 100,
            newBest,
            bossDefeated,
            expBoostUsed,
            source: "workout",
          },
        });
      },

      logSleep: (quality) => {
        const today = todayKey();
        set((s) => ({
          sleepLogs: [
            { date: today, quality },
            ...s.sleepLogs.filter((l) => l.date !== today),
          ],
        }));
      },

      logMeal: (meal) => {
        const state = get();
        const log: MealLog = {
          ...meal,
          id: crypto.randomUUID(),
          date: todayKey(),
        };
        set({ mealLogs: [log, ...state.mealLogs] });
      },

      // 食事の修正・削除。コンディションはワークアウト記録時に都度計算される
      // ため、過去に獲得したEXPへの遡及はない(修正はその後の補正にのみ効く)。
      updateMeal: (id, patch) =>
        set((s) => ({
          mealLogs: s.mealLogs.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      deleteMeal: (id) =>
        set((s) => ({ mealLogs: s.mealLogs.filter((m) => m.id !== id) })),

      claimQuest: (questId, rewardExp, rewardGold) => {
        const state = get();
        const today = todayKey();
        const claimed = state.claimedQuestsByDate[today] ?? [];
        if (claimed.includes(questId)) return;

        const { avatar: leveled, levelsGained } = addExp(state.avatar, rewardExp);
        const avatar: Avatar = { ...leveled, gold: leveled.gold + rewardGold };

        set({
          avatar,
          claimedQuestsByDate: {
            ...state.claimedQuestsByDate,
            [today]: [...claimed, questId],
          },
          lastReward: {
            exp: rewardExp,
            gold: rewardGold,
            levelsGained,
            statText: "クエスト達成！",
            modifier: 1,
            source: "quest",
          },
        });
      },

      claimAchievement: (id, rewardGold) => {
        const state = get();
        if (state.claimedAchievements.includes(id)) return;
        set({
          avatar: { ...state.avatar, gold: state.avatar.gold + rewardGold },
          claimedAchievements: [...state.claimedAchievements, id],
          lastReward: {
            exp: 0,
            gold: rewardGold,
            levelsGained: 0,
            statText: "実績解除！",
            modifier: 1,
            source: "achievement",
          },
        });
      },

      buyItem: (id) => {
        const state = get();
        const item = SHOP_ITEMS.find((i) => i.id === id);
        if (!item || state.avatar.gold < item.cost) return;
        const patch: Partial<GameState> = {
          avatar: { ...state.avatar, gold: state.avatar.gold - item.cost },
        };
        if (id === "expBoost") patch.expBoostCharges = state.expBoostCharges + 1;
        if (id === "streakShield") patch.streakShields = state.streakShields + 1;
        set(patch);
      },

      clearReward: () => set({ lastReward: null }),

      clearPenalty: () => set({ lastPenalty: null }),

      applyDailyPenalty: () => {
        const state = get();
        const today = todayKey();
        if (!state.profile) return;
        if (state.lastDailyCheckDate === today) return;

        const lastWorkout = state.workoutLogs[0]?.date ?? null;
        if (!lastWorkout) {
          // まだ一度もトレーニングしていない → ペナルティなし
          set({ lastDailyCheckDate: today });
          return;
        }

        // サボり判定もスケジュール基準にする(休養日=予定外の日は"サボり"に
        // 数えない)。最後のトレ以降・今日より前で、トレしていない予定日の数だけ
        // ダメージを受ける。これでストリークとペナルティの基準が揃う。
        const sched = effectiveSchedule(state.profile.trainingDays);
        const trained = new Set(state.workoutLogs.map((w) => w.date));
        const missedDays = missedScheduledDays(lastWorkout, today, sched, trained, 3);

        if (missedDays === 0) {
          set({ lastDailyCheckDate: today });
          return;
        }

        const boss = bossAt(state.boss.index);
        const damagePerDay = boss.attackPower;
        const currentHp = state.playerHp ?? maxHp(state.avatar.stats);
        const mhp = maxHp(state.avatar.stats);
        const newHp = Math.max(1, currentHp - damagePerDay * missedDays);
        const actualDamage = currentHp - newHp;

        if (actualDamage === 0) {
          set({ lastDailyCheckDate: today });
          return;
        }

        set({
          playerHp: newHp,
          lastDailyCheckDate: today,
          lastPenalty: {
            missedDays,
            damagePerDay,
            totalDamage: actualDamage,
            bossName: boss.name,
            bossEmoji: boss.emoji,
            newHp,
            maxHp: mhp,
          },
        });
      },

      resetAll: () => set({ profile: null, ...FRESH }),
    }),
    { name: "workout-game-v1" },
  ),
);

// セレクタ的ヘルパー(コンポーネントから使う)
export function selectToday(state: GameState) {
  const today = todayKey();
  const workouts = state.workoutLogs.filter((w) => w.date === today);
  const meals = state.mealLogs.filter((m) => m.date === today);
  const sleep = state.sleepLogs.find((s) => s.date === today) ?? null;
  const quests = state.profile
    ? evaluateDailyQuests(workouts, meals, state.profile)
    : [];
  const claimed = state.claimedQuestsByDate[today] ?? [];
  return { today, workouts, meals, sleep, quests, claimed };
}

/** 実績の進捗と達成状況 */
export function selectProgress(state: GameState): Progress {
  const a = state.avatar;
  const muscle = overallMuscle(partTiers(state.partVolumes));
  return {
    level: a.level,
    totalExp: a.totalExp,
    bestStreak: state.records.bestStreak,
    totalWorkouts: state.workoutLogs.length,
    bossesDefeated: state.bossesDefeated,
    muscle,
  };
}

export { ACHIEVEMENTS };
