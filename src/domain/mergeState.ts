import type { DurableGameState } from "./sync";
import type { MealLog, SleepLog, Stats, WorkoutLog } from "./types";
import { INITIAL_STATS, levelStateFromTotalExp } from "./avatar";
import { addStats } from "./expEngine";
import { categoryToPart, emptyPartVolumes, type PartVolumes } from "./parts";
import { bossAt } from "./bosses";
import { effectiveSchedule, isScheduledDay, advanceScheduleStreak } from "./schedule";

// P4(SYNC_DESIGN.md): LWW+進捗ガードで「勝った側」を丸ごと採用すると、負けた側
// だけが持つユニークな記録(ログ)を失ってしまう。ここではログをUUID/日付で
// UNIONし、派生状態(EXP/レベル/ステータス/ボス/ストリーク/自己ベスト/部位
// ボリューム)を「保存済みの値」だけから再計算する ―― 生の重量・レップ数から
// EXP公式を再実行することはしない。理由: 種目の係数(coefficient)や
// ボスのHPテーブルは将来調整されうる(DESIGN.md)。生入力から式を再実行すると、
// 係数を変えた瞬間に過去のログの獲得量が静かに変わってしまう。保存済みの
// earnedExp/statGains/partGainだけを合算すれば、その心配なく安全に再計算できる。
//
// 完全には再現できない項目(ショップ購入で増減するgold/expBoostCharges/
// streakShields/playerHp ― 購入履歴やペナルティのタイミングを保持していない)
// は、進捗の多い側(winner)の値をそのまま引き継ぐ(以前のLWW方式と同じ)。

function unionById<T extends { id: string }>(winner: T[], loser: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of winner) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  for (const item of loser) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function unionSleepLogs(winner: SleepLog[], loser: SleepLog[]): SleepLog[] {
  const byDate = new Map<string, SleepLog>();
  for (const log of winner) byDate.set(log.date, log);
  for (const log of loser) if (!byDate.has(log.date)) byDate.set(log.date, log);
  return [...byDate.values()];
}

function unionClaimedQuestsByDate(
  winner: Record<string, string[]>,
  loser: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const date of new Set([...Object.keys(winner), ...Object.keys(loser)])) {
    out[date] = [...new Set([...(winner[date] ?? []), ...(loser[date] ?? [])])];
  }
  return out;
}

function unionStrings(winner: string[], loser: string[]): string[] {
  return [...new Set([...winner, ...loser])];
}

/**
 * ログ単位の完全マージ。winner/loser は chooseWinner(進捗ガード)で決めた側を
 * 渡す。ログ・クエスト受領・実績・お気に入りはUNIONで両側とも保持する。
 * gold/expBoostCharges/streakShields/playerHp/bodyFat/プロフィール等の
 * 「購入・端末ローカル」寄りの項目は winner の値をそのまま引き継ぐ。
 */
export function mergeDurableStates(
  winner: DurableGameState,
  loser: DurableGameState,
): DurableGameState {
  const profile = winner.profile ?? loser.profile;

  const mealLogs = unionById<MealLog>(winner.mealLogs, loser.mealLogs);
  const sleepLogs = unionSleepLogs(winner.sleepLogs, loser.sleepLogs);
  const claimedQuestsByDate = unionClaimedQuestsByDate(winner.claimedQuestsByDate, loser.claimedQuestsByDate);
  const claimedAchievements = unionStrings(winner.claimedAchievements, loser.claimedAchievements);
  const favorites = unionStrings(winner.favorites, loser.favorites);

  // マージの計算はすべてこの1つの(undo付き)配列から行う。返り値用の
  // workoutLogsは、これの取り消しスナップショットだけを剥がした派生物。
  const rawWorkoutLogs = unionById<WorkoutLog>(winner.workoutLogs, loser.workoutLogs);

  // --- EXP/レベル/ステータス/部位ボリューム: 保存済みの値を合算するだけ ---
  let totalExp = 0;
  let stats: Stats = { ...INITIAL_STATS };
  const partVolumes: PartVolumes = emptyPartVolumes();
  for (const log of rawWorkoutLogs) {
    totalExp += log.earnedExp + (log.undo?.bossExp ?? 0);
    stats = addStats(stats, log.statGains);
    if (log.undo) partVolumes[categoryToPart(log.category)] += log.undo.partGain;
  }
  const levelState = levelStateFromTotalExp(totalExp);
  const avatar = { ...winner.avatar, ...levelState, stats };

  // --- ボス: 保存済みearnedExpを日付の古い順に適用してシミュレート ---
  const sortedByDateAsc = [...rawWorkoutLogs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let bossIndex = 0;
  let bossHp = bossAt(0).maxHp;
  let bossesDefeated = 0;
  for (const log of sortedByDateAsc) {
    bossHp -= log.earnedExp;
    if (bossHp <= 0) {
      bossesDefeated += 1;
      bossIndex += 1;
      bossHp = bossAt(bossIndex).maxHp;
    }
  }

  // --- ストリーク: 予定日の重複しない日付を時系列に辿って再計算(EXP非依存) ---
  let streak = { count: 0, lastDate: null as string | null };
  let bestStreak = Math.max(winner.records.bestStreak, loser.records.bestStreak);
  if (profile) {
    const sched = effectiveSchedule(profile.trainingDays);
    const uniqueDates = [...new Set(rawWorkoutLogs.map((w) => w.date))].sort();
    for (const date of uniqueDates) {
      if (isScheduledDay(date, sched)) {
        streak = advanceScheduleStreak(streak, date, sched);
        bestStreak = Math.max(bestStreak, streak.count);
      }
    }
  }

  // --- 自己ベスト: ボリュームは両側の記録値のmax、1日の最高EXPは両側+実際の
  //     合算値のmax(保存済みearnedExpの合算のみ。式の再実行はしない) ---
  const bestVolumeByExercise: Record<string, number> = { ...winner.records.bestVolumeByExercise };
  for (const [id, vol] of Object.entries(loser.records.bestVolumeByExercise)) {
    bestVolumeByExercise[id] = Math.max(bestVolumeByExercise[id] ?? 0, vol);
  }
  const expByDate = new Map<string, number>();
  for (const log of rawWorkoutLogs) {
    expByDate.set(log.date, (expByDate.get(log.date) ?? 0) + log.earnedExp);
  }
  let bestDayExp = Math.max(winner.records.bestDayExp, loser.records.bestDayExp);
  for (const sum of expByDate.values()) bestDayExp = Math.max(bestDayExp, sum);

  // 取り消し(undo)スナップショットは「マージ前」の状態を前提にしているため、
  // マージ後にそのまま使うと状態を壊しうる。安全のため返す配列からは取り除く
  // (次に記録する1件から、また取り消せるようになる)。
  const workoutLogs = rawWorkoutLogs
    .map((log): WorkoutLog => ({ ...log, undo: undefined }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // 新しい日付が先頭(既存の並び順)

  return {
    profile,
    avatar,
    workoutLogs,
    mealLogs,
    sleepLogs,
    streak,
    claimedQuestsByDate,
    startSnapshot: winner.startSnapshot ?? loser.startSnapshot,
    records: { bestVolumeByExercise, bestDayExp, bestStreak },
    boss: { index: bossIndex, hp: bossHp },
    bossesDefeated,
    claimedAchievements,
    expBoostCharges: winner.expBoostCharges,
    streakShields: winner.streakShields,
    partVolumes,
    bodyFat: winner.bodyFat,
    lastSetsByExercise: winner.lastSetsByExercise,
    lastMinutesByExercise: winner.lastMinutesByExercise,
    favorites,
    playerHp: winner.playerHp,
  };
}
