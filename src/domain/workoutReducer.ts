import type {
  Exercise,
  MealLog,
  Profile,
  SleepLog,
  Stats,
  StatKey,
  WorkoutLog,
  WorkoutSet,
  WorkoutUndo,
} from "./types";
import { addExp, maxHp } from "./avatar";
import { computeBaseExp, computeGold, computeStatGains, addStats } from "./expEngine";
import { computeCondition } from "./meals";
import { computeSleepCondition } from "./sleep";
import { effectiveSchedule, isScheduledDay, advanceScheduleStreak } from "./schedule";
import { categoryToPart, type PartVolumes } from "./parts";
import { bossAt } from "./bosses";

// DESIGN.md §2 のトレーニング記録ロジック(D-2)。useGameStore.logWorkout に
// 170行のモノリスとして集中していたストリーク/ボス/自己ベスト/HP/取り消し
// スナップショットの計算を、ここへ純関数として抽出した(テスト可能・移植可能に
// するため)。ストアは crypto.randomUUID()/todayKey() などの副作用だけを担い、
// 計算はすべてこの1関数に委ねる。

export interface StreakState {
  count: number;
  lastDate: string | null;
}

export interface BossState {
  index: number;
  hp: number;
}

export interface Records {
  bestVolumeByExercise: Record<string, number>;
  bestDayExp: number;
  bestStreak: number;
}

interface Avatar {
  level: number;
  totalExp: number;
  expIntoLevel: number;
  expForNextLevel: number;
  stats: Stats;
  gold: number;
}

/** logWorkout 実行前のストア状態のうち、計算に必要な部分だけを取り出した形 */
export interface WorkoutReducerState {
  avatar: Avatar;
  boss: BossState;
  bossesDefeated: number;
  streak: StreakState;
  streakShields: number;
  expBoostCharges: number;
  records: Records;
  partVolumes: PartVolumes;
  playerHp: number;
}

/** 呼び出し側(ストア)が用意する入力。id/today は副作用(crypto.randomUUID/Date)
 *  なので、ここでは既に確定した値として受け取る(ピュアに保つため)。 */
export interface WorkoutReducerInput {
  id: string;
  today: string;
  profile: Profile;
  exercise: Exercise;
  sets?: WorkoutSet[];
  minutes?: number;
  allMealLogs: MealLog[];
  allSleepLogs: SleepLog[];
  allWorkoutLogs: WorkoutLog[];
}

export interface WorkoutReward {
  exp: number;
  gold: number;
  levelsGained: number;
  statText: string;
  modifier: number;
  newBest?: string;
  bossDefeated?: string;
  expBoostUsed: boolean;
}

export interface WorkoutReducerResult {
  log: WorkoutLog;
  avatar: Avatar;
  boss: BossState;
  bossesDefeated: number;
  streak: StreakState;
  streakShields: number;
  expBoostCharges: number;
  records: Records;
  partVolumes: PartVolumes;
  playerHp: number;
  reward: WorkoutReward;
}

/** その種目1回ぶんのボリューム(自重は体重を負荷に含める) */
export function workoutVolume(
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

/**
 * トレーニング記録1件を適用した後の状態を計算する。baseExp が0以下(空の記録)
 * のときは何も起きないので null を返す(呼び出し側は早期returnする)。
 */
export function applyWorkoutLog(
  state: WorkoutReducerState,
  input: WorkoutReducerInput,
): WorkoutReducerResult | null {
  const { id, today, profile, exercise } = input;
  const workoutInput = { sets: input.sets, minutes: input.minutes };

  const todaysMeals = input.allMealLogs.filter((m) => m.date === today);
  const condition = computeCondition(todaysMeals, profile);
  const todaySleep = input.allSleepLogs.find((s) => s.date === today) ?? null;
  const sleepCond = computeSleepCondition(todaySleep?.quality ?? null);

  const baseExp = computeBaseExp(exercise, workoutInput, profile.weightKg);
  if (baseExp <= 0) return null;

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
    id,
    date: today,
    exerciseId: exercise.id,
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

  const statText = (Object.entries(statGains) as [StatKey, number][])
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

  const prevVolBest = records.bestVolumeByExercise[exercise.id] ?? 0;
  const todayExp =
    earnedExp +
    input.allWorkoutLogs.filter((w) => w.date === today).reduce((a, w) => a + w.earnedExp, 0);

  const nextRecords: Records = {
    bestVolumeByExercise: { ...records.bestVolumeByExercise },
    bestDayExp: Math.max(records.bestDayExp, todayExp),
    bestStreak: Math.max(records.bestStreak, streakRes.count),
  };
  if (volume > prevVolBest && prevVolBest > 0) {
    newBest = `${exercise.name} 自己ベスト更新！`;
    nextRecords.bestVolumeByExercise[exercise.id] = volume;
  } else {
    nextRecords.bestVolumeByExercise[exercise.id] = Math.max(prevVolBest, volume);
    if (todayExp > records.bestDayExp && records.bestDayExp > 0) {
      newBest = "1日の最高EXPを更新！";
    } else if (streakRes.count > records.bestStreak && records.bestStreak > 0) {
      newBest = `最長ストリーク更新！ ${streakRes.count}回`;
    }
  }

  // --- HPの回復: トレーニングするとHPが戻る ---
  const newMaxHp = maxHp(avatar.stats);
  const hpRecovery = Math.floor(earnedExp / 4);
  const hpBefore = state.playerHp;
  const playerHp = Math.min(newMaxHp, hpBefore + hpRecovery);

  // 取り消し用スナップショット(この記録が動かした状態の巻き戻し情報)
  const undo: WorkoutUndo = {
    streak: { ...state.streak },
    boss: { ...state.boss },
    defeatedBoss: !!bossDefeated,
    bossGold,
    bossExp,
    partGain,
    playerHp: hpBefore,
    prevBestVolume: prevVolBest,
    prevBestDayExp: records.bestDayExp,
    prevBestStreak: records.bestStreak,
    expBoostUsed,
    shieldUsed,
  };

  return {
    log: { ...log, undo },
    avatar,
    boss: { index: bossIndex, hp: bossHp },
    bossesDefeated,
    streak: { count: streakRes.count, lastDate: streakRes.lastDate },
    streakShields,
    expBoostCharges,
    records: nextRecords,
    partVolumes,
    playerHp,
    reward: {
      exp: earnedExp,
      gold: earnedGold + bossGold,
      levelsGained,
      statText,
      modifier: Math.round(condition.expModifier * sleepCond.expModifier * 100) / 100,
      newBest,
      bossDefeated,
      expBoostUsed,
    },
  };
}
