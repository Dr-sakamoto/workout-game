import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Avatar,
  MealLog,
  Profile,
  SleepLog,
  SleepQuality,
  StatKey,
  Stats,
  WorkoutLog,
  WorkoutSet,
} from "../domain/types";
import {
  createAvatar,
  addExp,
  levelStateFromTotalExp,
  INITIAL_STATS,
  maxHp,
} from "../domain/avatar";
import { EXERCISE_MAP } from "../domain/exercises";
import { addStats } from "../domain/expEngine";
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
import { effectiveSchedule, missedScheduledDays } from "../domain/schedule";
import { SHOP_ITEMS, type ItemEffect } from "../domain/shop";
import { applyWorkoutLog } from "../domain/workoutReducer";
import { ACHIEVEMENTS, type Progress } from "../domain/achievements";
// achievements.ts の Progress(実績の進捗)と名前が衝突するため別名にする
import type { Progress as SyncProgress } from "../domain/sync";

/** localStorage の保存キー。バックアップの書き出し/読み込みでも使う */
export const STORAGE_KEY = "workout-game-v1";

/**
 * persist のスキーマバージョン。フィールドを増減したら上げる(migrate が走る)。
 * v2: アカウント同期(SYNC_DESIGN.md P2)のブックキーピングフィールドを追加。
 * ここを上げないと、旧バージョンの保存データは version が一致してしまい
 * migrate が呼ばれず、syncEnabled/lastSyncedProgress が undefined のまま
 * ロードされて実行時エラーになる(zustand persist は version 不一致のときだけ
 * migrate を呼ぶ)。
 */
export const STORE_VERSION = 2;

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

// store/cloudSync.ts が型付きで参照できるよう export する
export interface GameState {
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
  sleepPopupDate: string | null; // 睡眠ポップアップを表示済み(=「あとで」済み)の日付

  // --- アカウント同期(SYNC_DESIGN.md)のブックキーピング ---
  // これらは同期対象(domain/sync.ts の DURABLE_STATE_KEYS)に含まれない。
  // クラウドへ送る耐久データとは別枠で持つ、同期の進行管理そのもの。
  syncEnabled: boolean; // 既定ON。設定でOFFにできる
  lastSyncedRevision: number; // 最後に取り込んだ/書き込んだremoteのrevision
  lastSyncedProgress: SyncProgress; // その時点のtotalExp/logCount(dirty判定用)
  syncNotice: string | null; // 非ブロッキングの同期通知(「別端末と同期しました」等)

  initProfile: (p: Profile) => void;
  setBodyFat: (n: number) => void;
  changeSchedule: (days: number[]) => void;
  toggleFavorite: (exerciseId: string) => void;
  logWorkout: (exerciseId: string, input: { sets?: WorkoutSet[]; minutes?: number }) => void;
  undoWorkout: (logId: string) => void;
  logMeal: (meal: Omit<MealLog, "id" | "date">) => void;
  updateMeal: (id: string, patch: Partial<Omit<MealLog, "id" | "date">>) => void;
  deleteMeal: (id: string) => void;
  logSleep: (quality: SleepQuality) => void;
  snoozeSleepPopup: () => void;
  claimQuest: (questId: string, rewardExp: number, rewardGold: number) => void;
  claimAchievement: (id: string, rewardGold: number) => void;
  buyItem: (id: ItemEffect) => void;
  clearReward: () => void;
  clearPenalty: () => void;
  applyDailyPenalty: () => void;
  setSyncEnabled: (on: boolean) => void;
  clearSyncNotice: () => void;
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
  sleepPopupDate: null as string | null,
  syncEnabled: true,
  lastSyncedRevision: 0,
  lastSyncedProgress: { totalExp: 0, logCount: 0 } as SyncProgress,
  syncNotice: null as string | null,
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

      // 計算そのものは domain/workoutReducer.ts の純関数(applyWorkoutLog)に
      // 委譲する(D-2)。ここは id/today の発行とストアの読み書きだけを担う。
      logWorkout: (exerciseId, input) => {
        const state = get();
        const profile = state.profile;
        const exercise = EXERCISE_MAP[exerciseId];
        if (!profile || !exercise) return;

        const result = applyWorkoutLog(
          {
            avatar: state.avatar,
            boss: state.boss,
            bossesDefeated: state.bossesDefeated,
            streak: state.streak,
            streakShields: state.streakShields,
            expBoostCharges: state.expBoostCharges,
            records: state.records,
            partVolumes: state.partVolumes,
            playerHp: state.playerHp ?? maxHp(state.avatar.stats),
          },
          {
            id: crypto.randomUUID(),
            today: todayKey(),
            profile,
            exercise,
            sets: input.sets,
            minutes: input.minutes,
            allMealLogs: state.mealLogs,
            allSleepLogs: state.sleepLogs,
            allWorkoutLogs: state.workoutLogs,
          },
        );
        if (!result) return;

        set({
          avatar: result.avatar,
          workoutLogs: [result.log, ...state.workoutLogs],
          streak: result.streak,
          streakShields: result.streakShields,
          expBoostCharges: result.expBoostCharges,
          records: result.records,
          partVolumes: result.partVolumes,
          playerHp: result.playerHp,
          lastSetsByExercise: input.sets
            ? { ...state.lastSetsByExercise, [exerciseId]: input.sets }
            : state.lastSetsByExercise,
          lastMinutesByExercise: input.minutes
            ? { ...state.lastMinutesByExercise, [exerciseId]: input.minutes }
            : state.lastMinutesByExercise,
          boss: result.boss,
          bossesDefeated: result.bossesDefeated,
          lastReward: { ...result.reward, source: "workout" },
        });
      },

      // 直近のトレ記録の取り消し(タイプミス対策)。安全に巻き戻せる条件を
      // 「当日の・最新の1件」に限定する。それより古い記録は、間に他の記録や
      // 日次ペナルティが挟まりスナップショットの整合が保証できないため対象外。
      undoWorkout: (logId) => {
        const state = get();
        const log = state.workoutLogs[0];
        if (!log || log.id !== logId || !log.undo) return;
        if (log.date !== todayKey()) return;
        const u = log.undo;

        // ステータスとレベル(レベルは累計EXPから決定的に復元できる)
        const negGains: Partial<Stats> = {};
        (Object.keys(log.statGains) as StatKey[]).forEach((k) => {
          negGains[k] = -(log.statGains[k] ?? 0);
        });
        const stats = addStats(state.avatar.stats, negGains);
        const avatar: Avatar = {
          ...state.avatar,
          ...levelStateFromTotalExp(state.avatar.totalExp - log.earnedExp - u.bossExp),
          stats,
          // 記録後にゴールドを使っていた場合はマイナスになりうるので0で止める
          gold: Math.max(0, state.avatar.gold - log.earnedGold - u.bossGold),
        };

        const partKey = categoryToPart(log.category);
        const partVolumes: PartVolumes = {
          ...state.partVolumes,
          [partKey]: Math.max(0, state.partVolumes[partKey] - u.partGain),
        };

        const records: Records = {
          bestVolumeByExercise: { ...state.records.bestVolumeByExercise },
          bestDayExp: u.prevBestDayExp,
          bestStreak: u.prevBestStreak,
        };
        if (u.prevBestVolume > 0) {
          records.bestVolumeByExercise[log.exerciseId] = u.prevBestVolume;
        } else {
          delete records.bestVolumeByExercise[log.exerciseId];
        }

        set({
          avatar,
          workoutLogs: state.workoutLogs.slice(1),
          streak: { ...u.streak },
          boss: { ...u.boss },
          bossesDefeated: state.bossesDefeated - (u.defeatedBoss ? 1 : 0),
          partVolumes,
          records,
          playerHp: Math.min(u.playerHp, maxHp(stats)),
          expBoostCharges: state.expBoostCharges + (u.expBoostUsed ? 1 : 0),
          streakShields: state.streakShields + (u.shieldUsed ? 1 : 0),
          lastReward: null,
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

      // 「あとで」を永続化し、睡眠ポップアップの割り込みを1日1回までにする。
      // 記録自体はホームのボタンからいつでもできる(§1「10秒で終わる軽さ」)。
      snoozeSleepPopup: () => set({ sleepPopupDate: todayKey() }),

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

      // クラウド同期のON/OFF。OFF→ONへの切り替えはstore/cloudSync.tsのサブスクが
      // 検知して起動時同期を再実行する。
      setSyncEnabled: (on) => set({ syncEnabled: on }),

      clearSyncNotice: () => set({ syncNotice: null }),

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
        // 0 まで許す。0 になるとアバターの見た目が一時的に1段階なまる
        // (weakenedBuild)。トレーニングでHPが戻れば見た目も戻る。
        const newHp = Math.max(0, currentHp - damagePerDay * missedDays);
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
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      // スキーマ変更に耐える移行。旧バージョン(またはキー欠落)の保存データに
      // 対し、FRESH の初期値を土台にして永続化された値を上書きする。これにより
      // 新しく追加したフィールド(例: sleepPopupDate)が undefined になって
      // 実行時エラーやゲーム崩壊を起こすのを防ぐ。プロフィールなどユーザー資産は
      // そのまま保持される。
      migrate: (persisted, _version) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        return {
          ...FRESH,
          ...p,
          // ネストしたオブジェクトも欠落キーを初期値で補う
          streak: { ...FRESH.streak, ...(p.streak ?? {}) },
          records: { ...FRESH.records, ...(p.records ?? {}) },
          boss: { ...FRESH.boss, ...(p.boss ?? {}) },
          partVolumes: { ...FRESH.partVolumes, ...(p.partVolumes ?? {}) },
        } as GameState;
      },
    },
  ),
);

// セレクタ的ヘルパー(コンポーネントから使う)
export function selectToday(state: GameState) {
  const today = todayKey();
  const workouts = state.workoutLogs.filter((w) => w.date === today);
  const meals = state.mealLogs.filter((m) => m.date === today);
  const sleep = state.sleepLogs.find((s) => s.date === today) ?? null;
  const quests = state.profile
    ? evaluateDailyQuests(workouts, meals, state.profile, state.avatar.level)
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
